import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { verifyToken } from '../utils/helpers';
import prisma from '../config/database';

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ success: false, error: 'No token provided' });
      return;
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        applicantProfile: true,
        employerProfile: true,
        subscription: {
          where: { status: 'ACTIVE' },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
    });

    if (!user) {
      res.status(401).json({ success: false, error: 'User not found' });
      return;
    }

    if (user.status !== 'ACTIVE') {
      res.status(403).json({ success: false, error: 'Account is suspended or inactive' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      applicantProfile: user.applicantProfile,
      employerProfile: user.employerProfile,
      subscription: user.subscription,
    };

    next();
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      res.status(401).json({ success: false, error: 'Token expired' });
      return;
    }
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

export const optionalAuth = async (
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = verifyToken(token);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        include: { applicantProfile: true, employerProfile: true },
      });
      if (user && user.status === 'ACTIVE') {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          applicantProfile: user.applicantProfile,
          employerProfile: user.employerProfile,
        };
      }
    }
  } catch (_e) {
    // silently ignore
  }
  next();
};
