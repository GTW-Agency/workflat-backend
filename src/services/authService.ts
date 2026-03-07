import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/prisma';
import { Role } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

interface RegisterData {
  email: string;
  password: string;
  role: Role;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export class AuthService {
  // ─── Token helpers ──────────────────────────────────────
  static generateTokens(userId: string, role: Role): TokenPair {
    const secret = process.env.JWT_SECRET!;
    const refreshSecret = process.env.JWT_REFRESH_SECRET!;

    const accessToken = jwt.sign({ userId, role }, secret, {
      expiresIn: process.env.JWT_EXPIRE || '15m',
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId }, refreshSecret, {
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
    } as jwt.SignOptions);

    return { accessToken, refreshToken };
  }

  // ─── Register ───────────────────────────────────────────
  async register(data: RegisterData) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already in use', 409);

    const password_hash = await bcrypt.hash(data.password, 12);

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password_hash,
        role: data.role,
        status: 'PENDING', // requires email verification
      },
    });

    // Create role-specific profile
    if (data.role === 'APPLICANT') {
      await prisma.applicantProfile.create({
        data: { user_id: user.id, first_name: '', last_name: '' },
      });
    } else if (data.role === 'EMPLOYER') {
      await prisma.employerProfile.create({
        data: { user_id: user.id, company_name: '' },
      });
      // Start them on the free plan
      await prisma.subscription.create({
        data: {
          employer_id: user.id,
          plan_type: 'FREE',
          status: 'ACTIVE',
          jobs_limit: 1,
          featured_jobs_limit: 0,
        },
      });
    }

    return user;
  }

  // ─── Login ──────────────────────────────────────────────
  async login(email: string, password: string): Promise<TokenPair & { user: object }> {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      throw new AppError('Invalid email or password', 401);
    }

    if (user.status === 'SUSPENDED') {
      throw new AppError('Your account has been suspended. Contact support.', 403);
    }

    if (user.status === 'PENDING') {
      throw new AppError('Please verify your email address first.', 403);
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    const tokens = AuthService.generateTokens(user.id, user.role);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
      },
    };
  }

  // ─── Refresh Token ──────────────────────────────────────
  async refreshToken(token: string): Promise<TokenPair> {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as { userId: string };
      const user = await prisma.user.findUnique({ where: { id: decoded.userId } });

      if (!user || user.status !== 'ACTIVE') {
        throw new AppError('Invalid refresh token', 401);
      }

      return AuthService.generateTokens(user.id, user.role);
    } catch {
      throw new AppError('Invalid or expired refresh token', 401);
    }
  }
}
