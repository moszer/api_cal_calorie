// middleware/errorMiddleware.js
import logger from '../utils/logger.js';

const notFound = (req, res, next) => {
  logger.warn(`Route not found`, { url: req.originalUrl, method: req.method, ip: req.ip });
  const error = new Error(`Not Found - ${req.originalUrl}`);
  res.status(404);
  next(error);
};

const errorHandler = (err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  
  // Log error details with appropriate level based on status code
  if (statusCode >= 500) {
    logger.error(`Server error: ${err.message}`, { 
      statusCode,
      url: req.originalUrl,
      method: req.method,
      error: err
    });
  } else {
    logger.warn(`Client error: ${err.message}`, {
      statusCode,
      url: req.originalUrl,
      method: req.method
    });
  }
  
  res.status(statusCode);
  res.json({
    message: err.message,
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
};

export { notFound, errorHandler };
