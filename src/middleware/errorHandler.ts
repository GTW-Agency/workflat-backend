import { Request, Response, NextFunction } from 'express';
import  logger  from '../config/logger';

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || 500;
  const message = err.isOperational ? err.message : 'Internal server error';

  // Log full error in server
  logger.error(`[${req.method}] ${req.path} — ${err.message}`, {
    stack: err.stack,
    statusCode,
  });

  // Prisma unique constraint
  if (err.code === 'P2002') {
    res.status(409).json({ error: 'Conflict', message: 'A record with that value already exists.' });
    return;
  }

  // Prisma not found
  if (err.code === 'P2025') {
    res.status(404).json({ error: 'Not Found', message: 'Record not found.' });
    return;
  }

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Server Error' : 'Request Error',
    message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};
