// Central error handler: turns thrown errors into consistent JSON responses.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  // Errors intentionally thrown by our services.
  if (err.isApiError) {
    const body = { error: err.message };
    if (err.errorCode) body.code = err.errorCode;
    return res.status(err.statusCode).json(body);
  }

  // Multer upload errors (file size / unexpected field, etc.).
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Excel file is too large (max 5 MB)' });
    }
    return res.status(400).json({ error: err.message || 'Upload failed' });
  }

  // Malformed JSON body (from express.json()).
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }

  // Configuration / infrastructure errors.
  if (err.code === 'MISSING_ENV') {
    return res.status(503).json({ error: err.message });
  }

  // Mongo / network blips (Atlas timeout, dropped socket, etc.).
  const mongoTransient =
    err.name === 'MongoNetworkError' ||
    err.name === 'MongoServerSelectionError' ||
    err.name === 'MongoExpiredSessionError' ||
    err.message?.includes?.('buffering timed out') ||
    err.message?.includes?.('ECONNREFUSED');
  if (mongoTransient) {
    console.error('Database temporarily unavailable:', err.message);
    return res.status(503).json({ error: 'Database temporarily unavailable, please retry' });
  }

  // Mongoose duplicate key.
  if (err.code === 11000) {
    const keyPattern = err.keyPattern || {};
    const fields = Object.keys(keyPattern);
    if (fields.includes('vehicleNo') && fields.includes('workType')) {
      const vehicleNo = err.keyValue?.vehicleNo || '';
      const workType = err.keyValue?.workType || '';
      return res.status(409).json({
        error: `A file already exists for vehicle ${vehicleNo} with work type ${workType}`.trim(),
        code: 'DUPLICATE_FILE',
      });
    }
    if (fields.length === 1 && fields[0] === 'vehicleNo') {
      const value = err.keyValue?.vehicleNo || '';
      return res.status(409).json({
        error: `A file already exists for vehicle number ${value}`.trim(),
        code: 'DUPLICATE_FILE',
      });
    }
    if (fields.includes('key') || fields[0] === 'key') {
      return res.status(409).json({ error: 'This RTO already exists' });
    }
    const field = fields[0] || 'value';
    return res.status(409).json({ error: `A record with this ${field} already exists` });
  }

  if (err.name === 'CastError') {
    return res.status(404).json({ error: 'Not found' });
  }

  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // CORS rejection from cors middleware.
  if (err.message && String(err.message).startsWith('CORS blocked')) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }

  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
}

module.exports = errorHandler;
