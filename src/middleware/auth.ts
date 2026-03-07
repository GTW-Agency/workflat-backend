import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: Role;
        status: string;
        applicantProfile: any;
        employerProfile: any;
        subscription: any[];
      };
    }
  }
}

interface JwtPayload {
  userId: string;
  role: Role;
  iat: number;
  exp: number;
}

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Unauthorized', message: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET;
    if (!secret) throw new Error('JWT_SECRET not configured');

    const decoded = jwt.verify(token, secret) as JwtPayload;

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        applicantProfile: true,
        employerProfile: true,
        subscription: { where: { status: 'ACTIVE' } },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({ error: 'Unauthorized', message: 'Account not found or inactive' });
      return;
    }

    req.user = user as any;
    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ error: 'Unauthorized', message: 'Token expired' });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid token' });
    } else {
      res.status(401).json({ error: 'Unauthorized', message: error.message });
    }
  }
};

export const authorize = (...roles: Role[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to perform this action',
      });
      return;
    }
    next();
  };
};
