import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analysisItemSchema,
  parseModelContent,
  validateItems,
  ModelOutputError,
  SENTIMENTS,
  TOPICS,
  MAX_SUMMARY_CHARS,
} from '../src/modules/analysis/analysisSchema.js';

describe('analysisSchema constants', () => {
  it('exports expected constants', () => {
    assert.deepEqual(SENTIMENTS, ['positive', 'neutral', 'negative']);
    assert.equal(TOPICS.length, 7);
    assert.ok(TOPICS.includes('quality'));
    assert.ok(TOPICS.includes('other'));
    assert.equal(MAX_SUMMARY_CHARS, 200);
  });
});

describe('analysisItemSchema', () => {
  const valid = {
    sentiment: 'positive',
    topics: ['quality'],
    summary: 'Great build quality and feel.',
    needs_reply: false,
  };

  it('passes for a valid object', () => {
    const res = analysisItemSchema.safeParse(valid);
    assert.equal(res.success, true);
    assert.deepEqual(res.data, valid);
  });

  it('rejects extra keys (strict)', () => {
    const res = analysisItemSchema.safeParse({ ...valid, extra: 'forbidden' });
    assert.equal(res.success, false);
  });

  it('rejects invalid sentiment', () => {
    const res = analysisItemSchema.safeParse({ ...valid, sentiment: 'ecstatic' });
    assert.equal(res.success, false);
  });

  it('rejects empty topics array', () => {
    const res = analysisItemSchema.safeParse({ ...valid, topics: [] });
    assert.equal(res.success, false);
  });

  it('rejects duplicate topics', () => {
    const res = analysisItemSchema.safeParse({ ...valid, topics: ['quality', 'quality'] });
    assert.equal(res.success, false);
  });

  it('rejects unknown topic', () => {
    const res = analysisItemSchema.safeParse({ ...valid, topics: ['unsupported_topic'] });
    assert.equal(res.success, false);
  });

  it('rejects empty or whitespace-only summary', () => {
    assert.equal(analysisItemSchema.safeParse({ ...valid, summary: '' }).success, false);
    assert.equal(analysisItemSchema.safeParse({ ...valid, summary: '   ' }).success, false);
  });

  it('rejects summary longer than 200 characters', () => {
    const longSummary = 'a'.repeat(201);
    const res = analysisItemSchema.safeParse({ ...valid, summary: longSummary });
    assert.equal(res.success, false);
  });

  it('collapses multiple whitespace inside summary', () => {
    const res = analysisItemSchema.safeParse({
      ...valid,
      summary: '  Multiple    spaces   between   words.  ',
    });
    assert.equal(res.success, true);
    assert.equal(res.data.summary, 'Multiple spaces between words.');
  });

  it('rejects non-boolean needs_reply', () => {
    assert.equal(analysisItemSchema.safeParse({ ...valid, needs_reply: 'true' }).success, false);
    assert.equal(analysisItemSchema.safeParse({ ...valid, needs_reply: 1 }).success, false);
    assert.equal(analysisItemSchema.safeParse({ ...valid, needs_reply: null }).success, false);
  });
});

describe('parseModelContent', () => {
  it('parses valid json object with results array', () => {
    const input = JSON.stringify({ results: [{ sentiment: 'positive' }] });
    const res = parseModelContent(input);
    assert.deepEqual(res, [{ sentiment: 'positive' }]);
  });

  it('strips markdown code fence with json identifier', () => {
    const input = '```json\n{"results": [{"sentiment": "positive"}]}\n```';
    const res = parseModelContent(input);
    assert.deepEqual(res, [{ sentiment: 'positive' }]);
  });

  it('strips plain markdown code fence', () => {
    const input = '```\n{"results": []}\n```';
    const res = parseModelContent(input);
    assert.deepEqual(res, []);
  });

  it('throws ModelOutputError on empty or non-string input', () => {
    assert.throws(() => parseModelContent(''), ModelOutputError);
    assert.throws(() => parseModelContent('   '), ModelOutputError);
    assert.throws(() => parseModelContent(null), ModelOutputError);
  });

  it('throws ModelOutputError on invalid JSON', () => {
    assert.throws(() => parseModelContent('{ invalid json }'), ModelOutputError);
  });

  it('throws ModelOutputError when root is not an object or lacks results array', () => {
    assert.throws(() => parseModelContent('[]'), ModelOutputError);
    assert.throws(() => parseModelContent('{"data": []}'), ModelOutputError);
    assert.throws(() => parseModelContent('{"results": "not an array"}'), ModelOutputError);
  });
});

describe('validateItems', () => {
  const validItem = {
    sentiment: 'positive',
    topics: ['quality'],
    summary: 'Good',
    needs_reply: false,
  };

  it('returns ok: true for matching count and valid items', () => {
    const res = validateItems([validItem, validItem], 2);
    assert.equal(res.length, 2);
    assert.equal(res[0].ok, true);
    assert.deepEqual(res[0].analysis, validItem);
    assert.equal(res[1].ok, true);
  });

  it('marks every index as count mismatch if array length does not match expectedCount', () => {
    const res = validateItems([validItem], 2);
    assert.equal(res.length, 2);
    assert.equal(res[0].ok, false);
    assert.equal(res[0].reason, 'count mismatch');
    assert.equal(res[1].ok, false);
    assert.equal(res[1].reason, 'count mismatch');
  });

  it('reports specific validation failure reason per item without crashing', () => {
    const invalidItem = { ...validItem, sentiment: 'invalid_sentiment' };
    const res = validateItems([validItem, invalidItem], 2);
    assert.equal(res[0].ok, true);
    assert.equal(res[1].ok, false);
    assert.ok(res[1].reason.includes('sentiment'));
  });
});
