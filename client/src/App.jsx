import React, { useState } from 'react';
import { uploadReviews } from './api/client.js';
import UploadPanel from './components/UploadPanel.jsx';
import SummaryCards from './components/SummaryCards.jsx';
import TopLists from './components/TopLists.jsx';
import ProductBreakdown from './components/ProductBreakdown.jsx';
import ReviewTable from './components/ReviewTable.jsx';
import MismatchList from './components/MismatchList.jsx';
import MetricsPanel from './components/MetricsPanel.jsx';
import ErrorBanner from './components/ErrorBanner.jsx';
import Loading from './components/Loading.jsx';

export default function App() {
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUploadedFile, setLastUploadedFile] = useState(null);

  async function handleUpload(file) {
    setIsLoading(true);
    setError(null);
    setLastUploadedFile(file);

    try {
      const responseData = await uploadReviews(file);
      setData(responseData);
    } catch (err) {
      setError({
        code: err.code || 'UPLOAD_ERROR',
        message: err.message || 'An error occurred during file upload.',
      });
    } finally {
      setIsLoading(false);
    }
  }

  function handleReset() {
    setData(null);
    setError(null);
    setLastUploadedFile(null);
  }

  function handleRetry() {
    if (lastUploadedFile) {
      handleUpload(lastUploadedFile);
    }
  }

  // Derive special states
  const hasData = Boolean(data && data.reviews);
  const totalAnalyzed = data?.insights?.summary?.totalAnalyzed ?? 0;
  const failedCount = data?.insights?.summary?.failedCount ?? 0;
  const isAllFailed = hasData && totalAnalyzed === 0 && failedCount > 0;
  const isZeroAnalyzed = hasData && totalAnalyzed === 0 && failedCount === 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-gray-900 tracking-tight">ReviewLens</h1>
            <p className="text-xs text-gray-500">AI-Powered Review Intelligence Dashboard</p>
          </div>

          {hasData && (
            <button
              type="button"
              onClick={handleReset}
              className="px-3.5 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-xs font-semibold rounded-lg shadow-sm transition"
            >
              Upload Another File
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Error notification banner */}
        <ErrorBanner
          error={error}
          onRetry={lastUploadedFile ? handleRetry : null}
          onDismiss={() => setError(null)}
        />

        {/* Loading State */}
        {isLoading && <Loading message="Processing and analyzing reviews with AI..." />}

        {/* Upload State (Before upload or when no data) */}
        {!hasData && !isLoading && <UploadPanel onUpload={handleUpload} isLoading={isLoading} />}

        {/* Dashboard View (After successful upload) */}
        {hasData && !isLoading && (
          <div className="space-y-6">
            {/* Special Zero State: No reviews analyzed */}
            {isZeroAnalyzed && (
              <div
                role="status"
                className="bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg p-6 text-center my-6"
              >
                <div className="font-semibold text-base mb-1">Zero Reviews Analyzed</div>
                <p className="text-xs text-yellow-700">
                  The uploaded file contained no valid review rows for analysis.
                </p>
              </div>
            )}

            {/* Special Failure State: All analyses failed */}
            {isAllFailed && (
              <div
                role="alert"
                className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-6 text-center my-6"
              >
                <div className="font-semibold text-base mb-1">All Analyses Failed</div>
                <p className="text-xs text-red-700">
                  All {failedCount} reviews failed AI analysis. Please verify your Groq API
                  configuration.
                </p>
              </div>
            )}

            {/* 1. Summary Cards */}
            <SummaryCards summary={data.insights?.summary} />

            {/* 2. Top 3 Complaints and Top 3 Praises side by side */}
            <TopLists
              complaints={data.insights?.topComplaints}
              praises={data.insights?.topPraises}
            />

            {/* 3. Product Breakdown */}
            <ProductBreakdown byProduct={data.insights?.byProduct} />

            {/* 4. Review Table with Filters */}
            <ReviewTable reviews={data.reviews} />

            {/* 5. Rating Mismatch List */}
            <MismatchList ratingAgreement={data.insights?.ratingAgreement} />

            {/* 6. Pipeline Execution Metrics */}
            <MetricsPanel metrics={data.metrics} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 py-4 text-center text-xs text-gray-400">
        ReviewLens - AI-Powered Customer Intelligence
      </footer>
    </div>
  );
}
