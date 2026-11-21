import React from 'react';
import { formatPercent, formatLabel } from '../utils/formatters.js';

export default function MismatchList({ ratingAgreement }) {
  if (!ratingAgreement) return null;

  const { comparedCount = 0, agreementPercent = 100, mismatches = [] } = ratingAgreement;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm my-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
        <div>
          <h3 className="text-base font-semibold text-gray-900">Rating vs. Sentiment Agreement</h3>
          <p className="text-xs text-gray-500">
            Compares star ratings with model-classified sentiments (1-2 Negative, 3 Neutral, 4-5
            Positive)
          </p>
        </div>
        <div className="text-right">
          <span className="text-sm font-bold text-gray-800">
            {formatPercent(agreementPercent)} Agreement
          </span>
          <span className="text-xs text-gray-500 ml-2">
            ({comparedCount - mismatches.length} of {comparedCount} matched)
          </span>
        </div>
      </div>

      {mismatches.length === 0 ? (
        <div className="text-xs text-gray-400 py-3 text-center border-t border-gray-100">
          No rating-sentiment mismatches detected. All rated reviews agree with their sentiment
          classification.
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-gray-100 pt-3">
          <table className="w-full text-left text-xs text-gray-600">
            <thead className="bg-purple-50 text-purple-900 font-semibold uppercase">
              <tr>
                <th scope="col" className="px-3 py-2">
                  Review ID
                </th>
                <th scope="col" className="px-3 py-2 text-center">
                  Star Rating
                </th>
                <th scope="col" className="px-3 py-2">
                  AI Sentiment
                </th>
                <th scope="col" className="px-3 py-2">
                  Mismatch Context
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {mismatches.map((m) => {
                const expected =
                  m.rating <= 2 ? 'Negative' : m.rating === 3 ? 'Neutral' : 'Positive';
                return (
                  <tr key={m.rowNumber ?? m.reviewId} className="hover:bg-gray-50 transition">
                    <td className="px-3 py-2 font-mono font-medium text-gray-900">{m.reviewId}</td>
                    <td className="px-3 py-2 text-center font-bold text-gray-800">{m.rating}</td>
                    <td className="px-3 py-2 font-semibold">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                          m.sentiment === 'positive'
                            ? 'bg-green-100 text-green-800'
                            : m.sentiment === 'negative'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-gray-200 text-gray-800'
                        }`}
                      >
                        {formatLabel(m.sentiment)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-500">
                      Rated {m.rating} stars (expected {expected}), but review text expressed{' '}
                      {m.sentiment} feedback
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
