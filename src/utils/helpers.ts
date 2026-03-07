import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '../types';

export const generateToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  } as jwt.SignOptions);
};

export const generateRefreshToken = (payload: JwtPayload): string => {
  return jwt.sign(payload, process.env.JWT_REFRESH_SECRET!, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '30d',
  } as jwt.SignOptions);
};

export const verifyToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_SECRET!) as JwtPayload;
};

export const verifyRefreshToken = (token: string): JwtPayload => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as JwtPayload;
};

export const generateRandomToken = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

export const getPlanLimits = (planType: string) => {
  const limits = {
    FREE: { jobs: 1, featured: 0, duration: 30 },
    STANDARD: { jobs: 5, featured: 1, duration: 60 },
    PREMIUM: { jobs: 999999, featured: 3, duration: 90 },
  };
  return limits[planType as keyof typeof limits] || limits.FREE;
};

export const paginate = (page: number, limit: number) => ({
  skip: (page - 1) * limit,
  take: limit,
});

export const formatPagination = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
});

export const slugify = (text: string): string => {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
};
