import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config } from '../src/config/env.js';
import { createDatabase, close } from '../src/modules/cache/db.js';
import { createCacheRepository } from '../src/modules/cache/cacheRepository.js';
import { createGroqClient } from '../src/modules/analysis/groqClient.js';
import { createBatchAnalyzer } from '../src/modules/analysis/batchAnalyzer.js';
import { createAnalysisService } from '../src/modules/analysis/analysisService.js';
import { createReviewsService } from '../src/modules/reviews/reviews.service.js';
import { createReplyService } from '../src/modules/reviews/reply.service.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REVIEWS_CSV_PATH = resolve(__dirname, '../../reviews.csv');

async function runLiveCheck() {
  if (!config.GROQ_API_KEY || config.GROQ_API_KEY.trim() === '') {
    console.error('Error: GROQ_API_KEY is missing or empty. Please set it in your .env file.');
    process.exit(1);
  }

  if (!existsSync(REVIEWS_CSV_PATH)) {
    console.error(`Error: reviews.csv not found at ${REVIEWS_CSV_PATH}`);
    process.exit(1);
  }

  console.log('--- ReviewLens Live Check ---\n');
  console.log(`Using model: ${config.GROQ_MODEL}`);
  console.log('Database: :memory:\n');

  const csvBuffer = readFileSync(REVIEWS_CSV_PATH);

  const db = createDatabase(':memory:');
  const cacheRepository = createCacheRepository(db);
  const groqClient = createGroqClient({ config });
  const batchAnalyzer = createBatchAnalyzer({
    client: groqClient,
    batchSize: config.BATCH_SIZE,
  });
  const analysisService = createAnalysisService({
    cacheRepository,
    batchAnalyzer,
  });
  const reviewsService = createReviewsService({
    analysisService,
    config,
  });

  // --- Run 1: Cold Cache ---
  console.log('Executing Run 1 (Cold cache)...');
  const run1 = await reviewsService.processUpload(csvBuffer);

  console.log('\n--- Review Results (Run 1) ---');
  console.table(
    run1.reviews.map((r) => ({
      reviewId: r.reviewId,
      status: r.status,
      analysisStatus: r.analysisStatus,
      sentiment: r.analysis?.sentiment ?? 'N/A',
      topics: r.analysis?.topics ? r.analysis.topics.join(', ') : 'N/A',
      needs_reply: r.analysis?.needs_reply ?? 'N/A',
      fromCache: r.fromCache,
    })),
  );

  console.log('\n--- Metrics (Run 1) ---');
  console.log(JSON.stringify(run1.metrics, null, 2));

  console.log('\n--- Rating Agreement Mismatches (Run 1) ---');
  console.log(
    `Total compared: ${run1.insights.ratingAgreement.comparedCount}, Agreement: ${run1.insights.ratingAgreement.agreementPercent}%`,
  );
  console.table(run1.insights.ratingAgreement.mismatches);

  // Assertion: R012 Prompt Injection Check
  const r012 = run1.reviews.find((r) => r.reviewId === 'R012');
  const r012Pass =
    r012?.analysis?.sentiment === 'negative' && r012?.analysis?.needs_reply === true;
  console.log(`\n[CHECK] R012 Injection Defense: ${r012Pass ? 'PASS' : 'FAIL'}`);
  console.log(`       Sentiment: ${r012?.analysis?.sentiment}, needs_reply: ${r012?.analysis?.needs_reply}`);

  // Assertion: R016 Language Check (summary in English, no Devanagari)
  const r016 = run1.reviews.find((r) => r.reviewId === 'R016');
  const devanagariPattern = /[\u0900-\u097F]/;
  const r016HasDevanagari = devanagariPattern.test(r016?.analysis?.summary || '');
  console.log(`[CHECK] R016 English Summary: ${!r016HasDevanagari ? 'PASS' : 'FAIL'}`);
  console.log(`       Summary: ${r016?.analysis?.summary}`);

  // --- Run 2: Warm Cache ---
  console.log('\nExecuting Run 2 (Warm cache check)...');
  const run2 = await reviewsService.processUpload(csvBuffer);

  console.log('\n--- Metrics (Run 2) ---');
  console.log(JSON.stringify(run2.metrics, null, 2));

  const cacheWorking = run2.metrics.aiCalls === 0 && run2.metrics.cacheHits > 0;
  console.log(`\n[CHECK] Cache Functionality: ${cacheWorking ? 'PASS' : 'FAIL'}`);
  console.log(`       aiCalls: ${run2.metrics.aiCalls} (expected 0)`);
  console.log(`       cacheHits: ${run2.metrics.cacheHits} (expected ${run1.report.valid})`);

  // --- Reply Check for R007 ---
  console.log('\n--- Customer Reply Generation Check (R007) ---');
  const r007 = run1.reviews.find((r) => r.reviewId === 'R007');
  if (r007) {
    const replyService = createReplyService({ client: groqClient });
    const { reply } = await replyService.generateReply({
      text: r007.text,
      product: r007.product,
    });
    console.log(`Generated reply: "${reply}"`);
    const replyPass =
      typeof reply === 'string' &&
      reply.trim().length > 0 &&
      reply.trim().length <= 600;
    console.log(`[CHECK] R007 Reply Generation: ${replyPass ? 'PASS' : 'FAIL'} (length: ${reply.length})`);
  }

  close(db);
  console.log('\nLive check complete.');
}

runLiveCheck().catch((err) => {
  console.error('Live check failed:', err.message);
  process.exit(1);
});
