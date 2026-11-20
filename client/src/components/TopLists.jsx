import React from 'react';
import { formatLabel } from '../utils/formatters.js';

export default function TopLists({ complaints = [], praises = [] }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 my-6">
      {/* Top Complaints */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-red-700 mb-3 flex items-center justify-between">
          <span>Top 3 Complaints</span>
          <span className="text-xs font-normal text-gray-500">Negative sentiment</span>
        </h3>

        {complaints.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            No complaints identified in this dataset.
          </div>
        ) : (
          <div className="space-y-4">
            {complaints.map((item) => (
              <div
                key={item.topic}
                className="border-b border-gray-100 last:border-b-0 pb-3 last:pb-0"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm text-gray-900">
                    {formatLabel(item.topic)}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-100 text-red-800">
                    {item.count} complaint{item.count > 1 ? 's' : ''}
                  </span>
                </div>
                {item.examples && item.examples.length > 0 && (
                  <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5 mt-1">
                    {item.examples.map((example, i) => (
                      <li key={i} className="truncate">
                        "{example}"
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Praises */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <h3 className="text-base font-semibold text-green-700 mb-3 flex items-center justify-between">
          <span>Top 3 Praises</span>
          <span className="text-xs font-normal text-gray-500">Positive sentiment</span>
        </h3>

        {praises.length === 0 ? (
          <div className="text-sm text-gray-400 py-4 text-center">
            No praises identified in this dataset.
          </div>
        ) : (
          <div className="space-y-4">
            {praises.map((item) => (
              <div
                key={item.topic}
                className="border-b border-gray-100 last:border-b-0 pb-3 last:pb-0"
              >
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-sm text-gray-900">
                    {formatLabel(item.topic)}
                  </span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-green-100 text-green-800">
                    {item.count} praise{item.count > 1 ? 's' : ''}
                  </span>
                </div>
                {item.examples && item.examples.length > 0 && (
                  <ul className="text-xs text-gray-600 list-disc list-inside space-y-0.5 mt-1">
                    {item.examples.map((example, i) => (
                      <li key={i} className="truncate">
                        "{example}"
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
