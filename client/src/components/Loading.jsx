import React from 'react';

export default function Loading({ message = 'Analyzing reviews...' }) {
  return (
    <div role="status" className="flex flex-col items-center justify-center p-12 text-center">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-4" />
      <span className="text-gray-700 font-medium text-sm">{message}</span>
      <span className="text-gray-400 text-xs mt-1">This may take a moment</span>
    </div>
  );
}
