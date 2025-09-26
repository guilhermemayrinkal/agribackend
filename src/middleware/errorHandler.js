const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Default error
  let error = {
    success: false,
    message: err.message || 'Internal Server Error',
    statusCode: err.statusCode || 500
  };

  // MySQL errors
  if (err.code) {
    switch (err.code) {
      case 'ER_DUP_ENTRY':
        error.message = 'Duplicate entry. This record already exists.';
        error.statusCode = 409;
        break;
      case 'ER_NO_REFERENCED_ROW_2':
        error.message = 'Referenced record does not exist.';
        error.statusCode = 400;
        break;
      case 'ER_ROW_IS_REFERENCED_2':
        error.message = 'Cannot delete record. It is referenced by other records.';
        error.statusCode = 400;
        break;
      case 'ER_BAD_FIELD_ERROR':
        error.message = 'Invalid field in query.';
        error.statusCode = 400;
        break;
      case 'ER_PARSE_ERROR':
        error.message = 'SQL syntax error.';
        error.statusCode = 400;
        break;
      default:
        error.message = 'Database error occurred.';
        error.statusCode = 500;
    }
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error.message = 'Invalid token.';
    error.statusCode = 401;
  }

  if (err.name === 'TokenExpiredError') {
    error.message = 'Token expired.';
    error.statusCode = 401;
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    error.message = 'Validation failed.';
    error.statusCode = 400;
  }

  // File upload errors
  if (err.code === 'LIMIT_FILE_SIZE') {
    error.message = 'File too large.';
    error.statusCode = 400;
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    error.message = 'Unexpected file field.';
    error.statusCode = 400;
  }

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production' && error.statusCode === 500) {
    error.message = 'Internal Server Error';
  }

  res.status(error.statusCode).json({
    success: false,
    message: error.message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

// 404 handler
const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
};

module.exports = {
  errorHandler,
  notFound
};