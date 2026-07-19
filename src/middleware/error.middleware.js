// Central error handler: turns thrown errors into consistent JSON responses.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Errors intentionally thrown by our services.
  if (err.isApiError) {
    const body = { error: err.message };
    if (err.errorCode) body.code = err.errorCode;
    return res.status(err.statusCode).json(body);
  }

  // Malformed JSON body (from express.json()).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Configuration / infrastructure errors.
  if (err.code === 'MISSING_ENV') {
    return res.status(500).json({ error: err.message });
  }

  // Mongoose duplicate key.
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || 'value';
    if (field === 'vehicleNo') {
      const value = err.keyValue?.vehicleNo || '';
      return res.status(409).json({
        error: `A file already exists for vehicle number ${value}`.trim(),
        code: 'DUPLICATE_VEHICLE',
      });
    }
    if (field === 'key') {
      return res.status(409).json({ error: 'This RTO already exists' });
    }
    return res.status(409).json({ error: `A record with this ${field} already exists` });
  }

  if (err.name === 'CastError') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
