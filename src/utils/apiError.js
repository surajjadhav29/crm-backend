// A typed error carrying an HTTP status code (and optional machine-readable
// code). Services throw these; the central error handler turns them into
// consistent JSON responses.
class ApiError extends Error {
  constructor(statusCode, message, code) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.isApiError = true;
    if (code) this.errorCode = code;
  }

  static badRequest(message, code) {
    return new ApiError(400, message, code);
  }

  static unauthorized(message = 'Not authenticated', code) {
    return new ApiError(401, message, code);
  }

  static forbidden(message = 'Forbidden', code) {
    return new ApiError(403, message, code);
  }

  static notFound(message = 'Not found', code) {
    return new ApiError(404, message, code);
  }

  static conflict(message, code) {
    return new ApiError(409, message, code);
  }
}

module.exports = ApiError;
