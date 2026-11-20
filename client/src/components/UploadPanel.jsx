import React, { useState, useRef } from 'react';

const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export default function UploadPanel({ onUpload, isLoading }) {
  const [dragOver, setDragOver] = useState(false);
  const [clientError, setClientError] = useState(null);
  const fileInputRef = useRef(null);

  function validateAndSelect(file) {
    setClientError(null);
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setClientError('Invalid file type. Please upload a .csv file.');
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setClientError('File exceeds maximum allowed size of 5 MB.');
      return;
    }

    onUpload(file);
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    validateAndSelect(file);
  }

  function handleDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files?.[0];
    validateAndSelect(file);
  }

  function handleDragOver(e) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-8 shadow-sm max-w-2xl mx-auto my-8">
      <div className="text-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">Upload Reviews CSV</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload customer reviews to clean data, extract sentiment, and detect key insights.
        </p>
      </div>

      {clientError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded text-sm">
          {clientError}
        </div>
      )}

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition cursor-pointer ${
          dragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400 bg-gray-50'
        }`}
        onClick={() => !isLoading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv"
          onChange={handleFileChange}
          disabled={isLoading}
          className="hidden"
          id="csv-file-input"
          aria-label="Upload CSV file"
        />

        <div className="space-y-2">
          <div className="text-sm text-gray-600 font-medium">
            Drag and drop your CSV file here, or{' '}
            <span className="text-blue-600 underline">browse</span>
          </div>
          <div className="text-xs text-gray-400">
            Accepts .csv up to 5 MB with headers: review_id, product, rating, date, review_text
          </div>
        </div>
      </div>

      <div className="mt-6 flex justify-end">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading}
          className={`px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition ${
            isLoading ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 shadow-sm'
          }`}
        >
          {isLoading ? 'Processing CSV...' : 'Select File'}
        </button>
      </div>
    </div>
  );
}
