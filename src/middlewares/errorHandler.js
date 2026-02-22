const NODE_ENV = process.env.NODE_ENV || 'development';

class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

function ok(res, data, meta) {
  return res.json({ ok: true, data, meta });
}

function notFoundHandler(req, res) {
  return res.status(404).json({
    ok: false,
    error: {
      message: 'Ruta no encontrada',
      path: req.originalUrl
    }
  });
}

function errorHandler(err, req, res, next) {
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const message =
    err instanceof ApiError ? err.message : 'Error interno del servidor';

  // Log básico (útil para Render)
  console.error(err);

  return res.status(statusCode).json({
    ok: false,
    error: {
      message,
      details: err instanceof ApiError ? err.details : undefined,
      stack: NODE_ENV === 'development' ? err.stack : undefined
    }
  });
}

module.exports = {
  ApiError,
  ok,
  notFoundHandler,
  errorHandler
};

