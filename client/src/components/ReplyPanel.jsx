import React, { useState } from 'react';
import { requestReply } from '../api/client.js';

export default function ReplyPanel({ review }) {
  const [isOpen, setIsOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  async function fetchReply() {
    setIsLoading(true);
    setError(null);
    setCopied(false);
    try {
      const data = await requestReply({
        text: review.text,
        product: review.product !== 'Unknown product' ? review.product : undefined,
      });
      setReplyText(data.reply);
      setIsOpen(true);
    } catch (err) {
      setError(err.message || 'Failed to generate reply.');
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }

  function handleCopy() {
    if (!replyText) return;
    navigator.clipboard.writeText(replyText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // Only reviews with needs_reply show Suggest Reply
  if (!review.analysis?.needs_reply) {
    return null;
  }

  return (
    <div className="mt-2 text-xs">
      {!isOpen ? (
        <button
          type="button"
          onClick={fetchReply}
          disabled={isLoading}
          className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded font-medium transition"
        >
          {isLoading ? 'Generating reply...' : 'Suggest reply'}
        </button>
      ) : (
        <div className="bg-amber-50/60 border border-amber-200 rounded p-3 mt-1 space-y-2">
          <div className="flex justify-between items-center text-amber-900 font-semibold">
            <span>Suggested Customer Reply</span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-gray-600 text-xs px-1"
              aria-label="Close reply panel"
            >
              Close
            </button>
          </div>

          {isLoading ? (
            <div className="text-gray-500 py-2 flex items-center gap-2">
              <span className="w-3 h-3 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <span>Generating response...</span>
            </div>
          ) : error ? (
            <div className="text-red-700 bg-red-50 p-2 rounded border border-red-200">
              <div>{error}</div>
              <button
                type="button"
                onClick={fetchReply}
                className="mt-1 text-xs text-red-800 underline font-semibold"
              >
                Try again
              </button>
            </div>
          ) : (
            <>
              <p className="text-gray-800 bg-white p-2.5 rounded border border-amber-200 whitespace-pre-wrap leading-relaxed">
                {replyText}
              </p>
              <div className="flex gap-2 justify-end pt-1">
                <button
                  type="button"
                  onClick={fetchReply}
                  disabled={isLoading}
                  className="px-2.5 py-1 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 rounded transition font-medium"
                >
                  Regenerate
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded transition font-medium"
                >
                  {copied ? 'Copied to clipboard' : 'Copy reply'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
