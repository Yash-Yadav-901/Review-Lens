import React from 'react';

export default function ErrorBanner({ error, onRetry, onDismiss }) {
  if (!error) return null;

  return (
    <div
      role="alert"
      className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-4 my-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3"
    >
      <div>
        <div className="font-semibold text-sm">{error.code ? `[${error.code}] ` : ''}Error</div>
        <div className="text-sm mt-0.5">{error.message}</div>
      </div>
      <div className="flex items-center gap-2 self-end sm:self-auto">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition"
          >
            Retry
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="px-3 py-1.5 bg-white border border-red-300 text-red-700 hover:bg-red-50 text-xs font-medium rounded transition"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
