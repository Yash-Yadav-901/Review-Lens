import React, { useState, useMemo } from 'react';
import { formatRating, formatLabel, isRatingMismatch } from '../utils/formatters.js';
import { filterReviews } from '../utils/filterReviews.js';
import ReplyPanel from './ReplyPanel.jsx';

const INITIAL_FILTERS = {
  product: 'all',
  sentiment: 'all',
  topic: 'all',
  status: 'all',
};

const TRUNCATE_PREVIEW_CHARS = 120;

export default function ReviewTable({ reviews = [] }) {
  const [filters, setFilters] = useState(INITIAL_FILTERS);
  const [expandedTextIds, setExpandedTextIds] = useState(new Set());

  // Derive unique product list
  const products = useMemo(() => {
    const set = new Set();
    reviews.forEach((r) => {
      if (r.product) set.add(r.product);
    });
    return Array.from(set).sort();
  }, [reviews]);

  // Derive unique topic list from analyzed reviews
  const topics = useMemo(() => {
    const set = new Set();
    reviews.forEach((r) => {
      if (r.analysis?.topics) {
        r.analysis.topics.forEach((t) => set.add(t));
      }
    });
    return Array.from(set).sort();
  }, [reviews]);

  const filteredReviews = useMemo(() => {
    return filterReviews(reviews, filters);
  }, [reviews, filters]);

  function handleFilterChange(key, value) {
    setFilters((prev) => ({ ...prev, [key]: value }));
  }

  function handleClearFilters() {
    setFilters(INITIAL_FILTERS);
  }

  function toggleExpandText(id) {
    setExpandedTextIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm my-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Reviews Overview</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Showing {filteredReviews.length} of {reviews.length} total reviews
          </p>
        </div>

        {/* Clear Filters Button */}
        {(filters.product !== 'all' ||
          filters.sentiment !== 'all' ||
          filters.topic !== 'all' ||
          filters.status !== 'all') && (
          <button
            type="button"
            onClick={handleClearFilters}
            className="text-xs text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded border border-blue-200 hover:bg-blue-50 transition"
          >
            Clear Filters
          </button>
        )}
      </div>

      {/* Filter Toolbar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-gray-50 p-3 rounded-lg border border-gray-200 mb-4 text-xs">
        {/* Product Filter */}
        <div>
          <label htmlFor="filter-product" className="block font-medium text-gray-700 mb-1">
            Product
          </label>
          <select
            id="filter-product"
            value={filters.product}
            onChange={(e) => handleFilterChange('product', e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Products</option>
            {products.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>

        {/* Sentiment Filter */}
        <div>
          <label htmlFor="filter-sentiment" className="block font-medium text-gray-700 mb-1">
            Sentiment
          </label>
          <select
            id="filter-sentiment"
            value={filters.sentiment}
            onChange={(e) => handleFilterChange('sentiment', e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Sentiments</option>
            <option value="positive">Positive</option>
            <option value="neutral">Neutral</option>
            <option value="negative">Negative</option>
          </select>
        </div>

        {/* Topic Filter */}
        <div>
          <label htmlFor="filter-topic" className="block font-medium text-gray-700 mb-1">
            Topic
          </label>
          <select
            id="filter-topic"
            value={filters.topic}
            onChange={(e) => handleFilterChange('topic', e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Topics</option>
            {topics.map((t) => (
              <option key={t} value={t}>
                {formatLabel(t)}
              </option>
            ))}
          </select>
        </div>

        {/* Status Filter */}
        <div>
          <label htmlFor="filter-status" className="block font-medium text-gray-700 mb-1">
            Status
          </label>
          <select
            id="filter-status"
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="w-full bg-white border border-gray-300 rounded px-2.5 py-1.5 text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">All Statuses</option>
            <option value="needs_reply">Needs Reply</option>
            <option value="failed">Analysis Failed</option>
            <option value="duplicates_skipped">Duplicates & Skipped</option>
          </select>
        </div>
      </div>

      {/* Review Table Container */}
      <div className="overflow-x-auto border border-gray-200 rounded-lg">
        <table className="w-full text-left text-xs text-gray-600">
          <thead className="bg-gray-50 text-gray-700 font-semibold uppercase border-b border-gray-200">
            <tr>
              <th scope="col" className="px-3 py-3 w-16">
                ID
              </th>
              <th scope="col" className="px-3 py-3 w-28">
                Product
              </th>
              <th scope="col" className="px-3 py-3 w-14 text-center">
                Rating
              </th>
              <th scope="col" className="px-3 py-3 w-24">
                Sentiment
              </th>
              <th scope="col" className="px-3 py-3 w-32">
                Topics
              </th>
              <th scope="col" className="px-4 py-3 min-w-[200px]">
                Review & Summary
              </th>
              <th scope="col" className="px-3 py-3 w-28 text-center">
                Flags
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filteredReviews.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-gray-400">
                  No reviews match the selected filter criteria.
                </td>
              </tr>
            ) : (
              filteredReviews.map((r) => {
                const isMismatch = isRatingMismatch(r);
                const isExpanded = expandedTextIds.has(r.reviewId);
                const isLongText = (r.text || '').length > TRUNCATE_PREVIEW_CHARS;
                const displayText =
                  isLongText && !isExpanded
                    ? `${r.text.slice(0, TRUNCATE_PREVIEW_CHARS)}...`
                    : r.text;

                return (
                  <tr
                    key={r.reviewId}
                    className={`hover:bg-gray-50/80 transition ${
                      r.status === 'duplicate' || r.status === 'skipped_empty'
                        ? 'bg-gray-50/40 text-gray-400'
                        : ''
                    }`}
                  >
                    {/* ID */}
                    <td className="px-3 py-3 font-mono font-medium text-gray-900 align-top">
                      {r.reviewId}
                    </td>

                    {/* Product */}
                    <td className="px-3 py-3 font-medium text-gray-800 align-top">{r.product}</td>

                    {/* Rating */}
                    <td className="px-3 py-3 text-center font-bold text-gray-800 align-top">
                      {formatRating(r.rating)}
                    </td>

                    {/* Sentiment */}
                    <td className="px-3 py-3 align-top">
                      {r.status === 'duplicate' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-200 text-gray-700">
                          Duplicate
                        </span>
                      ) : r.status === 'skipped_empty' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-200 text-gray-700">
                          Empty
                        </span>
                      ) : r.analysisStatus === 'analysis_failed' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800">
                          Failed
                        </span>
                      ) : r.analysis?.sentiment === 'positive' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-green-100 text-green-800">
                          Positive
                        </span>
                      ) : r.analysis?.sentiment === 'negative' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-red-100 text-red-800">
                          Negative
                        </span>
                      ) : r.analysis?.sentiment === 'neutral' ? (
                        <span className="inline-block px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-200 text-gray-800">
                          Neutral
                        </span>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Topics */}
                    <td className="px-3 py-3 align-top">
                      {r.analysis?.topics && r.analysis.topics.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {r.analysis.topics.map((top) => (
                            <span
                              key={top}
                              className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[10px]"
                            >
                              {formatLabel(top)}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>

                    {/* Review text & Summary */}
                    <td className="px-4 py-3 align-top">
                      {/* Summary line */}
                      {r.analysis?.summary && (
                        <div className="font-semibold text-gray-900 mb-1 text-xs">
                          {r.analysis.summary}
                        </div>
                      )}

                      {/* Plain text review body - React handles escaping */}
                      <div className="text-gray-600 leading-relaxed">
                        {displayText}
                        {isLongText && (
                          <button
                            type="button"
                            onClick={() => toggleExpandText(r.reviewId)}
                            className="ml-1 text-blue-600 hover:text-blue-800 text-[11px] underline font-medium"
                          >
                            {isExpanded ? 'Show less' : 'Read more'}
                          </button>
                        )}
                      </div>

                      {/* Duplicate note */}
                      {r.duplicateOf && (
                        <div className="text-[11px] text-gray-400 mt-1 italic">
                          Duplicate of {r.duplicateOf}
                        </div>
                      )}

                      {/* Inline Reply Panel */}
                      {r.analysis?.needs_reply && <ReplyPanel review={r} />}
                    </td>

                    {/* Flags (Needs reply, Mismatch, From Cache) */}
                    <td className="px-3 py-3 align-top text-center space-y-1">
                      {r.analysis?.needs_reply && (
                        <div className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-900 font-semibold text-[10px]">
                          Needs Reply
                        </div>
                      )}
                      {isMismatch && (
                        <div className="inline-block px-2 py-0.5 rounded bg-purple-100 text-purple-900 font-semibold text-[10px]">
                          Mismatch
                        </div>
                      )}
                      {r.fromCache && <div className="text-[10px] text-gray-400">Cached</div>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
