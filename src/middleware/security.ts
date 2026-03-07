import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import cors from 'cors';

export const helmetMiddleware = helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
});

export const corsMiddleware = cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'http://localhost:3000',
      'http://localhost:3000',
      'http://localhost:5173',
    ];
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
});

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests, please try again later.' },
});

export const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { success: false, error: 'Upload limit reached. Please try again later.' },
});

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const statusCode = err.statusCode || err.status || 500;
  const message = err.message || 'Internal server error';

  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
};

export const notFound = (_req: Request, res: Response): void => {
  res.status(404).json({ success: false, error: 'Route not found' });
};
