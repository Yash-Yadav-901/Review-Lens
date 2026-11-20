import React from 'react';
import { formatLabel } from '../utils/formatters.js';

export default function ProductBreakdown({ byProduct = [] }) {
  if (!byProduct || byProduct.length === 0) return null;

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm my-6">
      <h3 className="text-base font-semibold text-gray-900 mb-3">Product Breakdown</h3>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-50 text-xs font-semibold text-gray-700 uppercase border-b border-gray-200">
            <tr>
              <th scope="col" className="px-4 py-3">
                Product
              </th>
              <th scope="col" className="px-4 py-3 text-right">
                Total
              </th>
              <th scope="col" className="px-4 py-3 text-right text-green-700">
                Positive
              </th>
              <th scope="col" className="px-4 py-3 text-right text-gray-700">
                Neutral
              </th>
              <th scope="col" className="px-4 py-3 text-right text-red-700">
                Negative
              </th>
              <th scope="col" className="px-4 py-3">
                Top Negative Topics
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {byProduct.map((p) => (
              <tr key={p.product} className="hover:bg-gray-50 transition">
                <td className="px-4 py-3 font-medium text-gray-900">{p.product}</td>
                <td className="px-4 py-3 text-right font-semibold">{p.total}</td>
                <td className="px-4 py-3 text-right font-semibold text-green-600">{p.positive}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-600">{p.neutral}</td>
                <td className="px-4 py-3 text-right font-semibold text-red-600">{p.negative}</td>
                <td className="px-4 py-3 text-xs">
                  {p.topNegativeTopics && p.topNegativeTopics.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {p.topNegativeTopics.map((top) => (
                        <span
                          key={top.topic}
                          className="px-2 py-0.5 rounded bg-red-50 text-red-700 border border-red-200"
                        >
                          {formatLabel(top.topic)} ({top.count})
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-gray-400">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
