import { Request, Response, NextFunction } from 'express';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  console.error('Error:', err);

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal server error';

  // Don't leak error details in production
  if (process.env.NODE_ENV === 'production') {
    return res.status(statusCode).json({
      error: statusCode === 500 ? 'Internal server error' : message,
    });
  }

  res.status(statusCode).json({
    error: message,
    stack: err.stack,
  });
}
