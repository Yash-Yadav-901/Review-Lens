import React from 'react';

export default function MetricsPanel({ metrics }) {
  if (!metrics) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm my-6">
      <h3 className="text-base font-semibold text-gray-900 mb-3">Pipeline Execution Metrics</h3>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        {/* AI Calls */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">AI Calls</div>
          <div className="text-xl font-bold text-gray-900 mt-1">{metrics.aiCalls ?? 0}</div>
        </div>

        {/* Cache Hits */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">Cache Hits</div>
          <div className="text-xl font-bold text-green-700 mt-1">{metrics.cacheHits ?? 0}</div>
        </div>

        {/* Cache Misses */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">Cache Misses</div>
          <div className="text-xl font-bold text-gray-700 mt-1">{metrics.cacheMisses ?? 0}</div>
        </div>

        {/* Retries */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">Retries</div>
          <div className="text-xl font-bold text-gray-700 mt-1">{metrics.retries ?? 0}</div>
        </div>

        {/* Failed */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">Failed</div>
          <div
            className={`text-xl font-bold mt-1 ${
              (metrics.failed ?? 0) > 0 ? 'text-red-700' : 'text-gray-700'
            }`}
          >
            {metrics.failed ?? 0}
          </div>
        </div>

        {/* Duration */}
        <div className="bg-gray-50 border border-gray-200 rounded p-3 text-center">
          <div className="text-xs text-gray-500 font-medium">Duration</div>
          <div className="text-xl font-bold text-blue-700 mt-1">
            {metrics.durationMs ? `${metrics.durationMs}ms` : '0ms'}
          </div>
        </div>
      </div>
    </div>
  );
}
