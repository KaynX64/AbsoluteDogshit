// Creates errors with HTTP status codes for route handlers.

export function fail(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}
