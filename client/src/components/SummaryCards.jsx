import React from 'react';
import { formatPercent } from '../utils/formatters.js';

export default function SummaryCards({ summary }) {
  if (!summary) return null;

  return (
    <div className="space-y-3 my-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {/* Total Analyzed */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Total Analyzed
          </div>
          <div className="text-2xl font-bold text-gray-900 mt-1">{summary.totalAnalyzed ?? 0}</div>
        </div>

        {/* Positive */}
        <div className="bg-white border border-green-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-green-700 uppercase tracking-wider">
            Positive
          </div>
          <div className="text-2xl font-bold text-green-700 mt-1">
            {formatPercent(summary.positive?.pct)}
          </div>
          <div className="text-xs text-green-600 mt-0.5">
            {summary.positive?.count ?? 0} reviews
          </div>
        </div>

        {/* Neutral */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-gray-600 uppercase tracking-wider">Neutral</div>
          <div className="text-2xl font-bold text-gray-700 mt-1">
            {formatPercent(summary.neutral?.pct)}
          </div>
          <div className="text-xs text-gray-500 mt-0.5">{summary.neutral?.count ?? 0} reviews</div>
        </div>

        {/* Negative */}
        <div className="bg-white border border-red-200 rounded-lg p-4 shadow-sm">
          <div className="text-xs font-medium text-red-700 uppercase tracking-wider">Negative</div>
          <div className="text-2xl font-bold text-red-700 mt-1">
            {formatPercent(summary.negative?.pct)}
          </div>
          <div className="text-xs text-red-600 mt-0.5">{summary.negative?.count ?? 0} reviews</div>
        </div>

        {/* Needs Reply */}
        <div className="bg-white border border-amber-200 rounded-lg p-4 shadow-sm col-span-2 md:col-span-1">
          <div className="text-xs font-medium text-amber-800 uppercase tracking-wider">
            Needs Reply
          </div>
          <div className="text-2xl font-bold text-amber-800 mt-1">
            {summary.needsReplyCount ?? 0}
          </div>
          <div className="text-xs text-amber-700 mt-0.5">Customer issues flagged</div>
        </div>
      </div>

      {/* Conditional notification pills for excluded/skipped/failed rows */}
      {(summary.skippedEmpty > 0 || summary.excludedDuplicates > 0 || summary.failedCount > 0) && (
        <div className="flex flex-wrap gap-2 pt-1 text-xs text-gray-600">
          {summary.skippedEmpty > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-gray-100 border border-gray-300">
              {summary.skippedEmpty} empty review{summary.skippedEmpty > 1 ? 's' : ''} skipped
            </span>
          )}
          {summary.excludedDuplicates > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-gray-100 border border-gray-300">
              {summary.excludedDuplicates} duplicate{summary.excludedDuplicates > 1 ? 's' : ''}{' '}
              excluded
            </span>
          )}
          {summary.failedCount > 0 && (
            <span className="inline-flex items-center px-2.5 py-1 rounded bg-red-100 border border-red-300 text-red-800 font-medium">
              {summary.failedCount} review analysis failed
            </span>
          )}
        </div>
      )}
    </div>
  );
}
