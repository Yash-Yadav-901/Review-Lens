export class ApiClientError extends Error {
  constructor(message, code = 'UNKNOWN_ERROR', statusCode = 0, details = null) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Helper to execute fetch and parse json response.
 */
async function sendRequest(url, options = {}) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (netErr) {
    throw new ApiClientError(
      'Server is unreachable. Please check your connection and ensure the server is running.',
      'NETWORK_ERROR',
      0,
      { originalError: netErr.message },
    );
  }

  let json;
  try {
    json = await res.json();
  } catch {
    throw new ApiClientError(
      'Received an invalid or non-JSON response from server.',
      'INVALID_RESPONSE',
      res.status,
    );
  }

  if (!res.ok || json.success === false) {
    const errorObj = json.error || {};
    const code = errorObj.code || 'REQUEST_FAILED';
    const message = errorObj.message || `Request failed with status ${res.status}`;
    throw new ApiClientError(message, code, res.status, errorObj.details || null);
  }

  return json.data;
}

/**
 * Uploads a CSV file to the review processing pipeline.
 *
 * @param {File | Blob} file
 * @returns {Promise<{ reviews: Array, report: object, insights: object, metrics: object, parseIssues: Array }>}
 */
export async function uploadReviews(file) {
  const formData = new FormData();
  formData.append('file', file);

  return sendRequest('/api/reviews/upload', {
    method: 'POST',
    body: formData,
  });
}

/**
 * Requests an AI-generated customer reply for a review.
 *
 * @param {{ text: string, product?: string }} payload
 * @returns {Promise<{ reply: string }>}
 */
export async function requestReply({ text, product }) {
  return sendRequest('/api/reviews/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      text,
      ...(product ? { product } : {}),
    }),
  });
}
