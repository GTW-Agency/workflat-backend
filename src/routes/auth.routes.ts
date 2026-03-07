import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import prisma from '../config/database';
import { authenticate } from '../middleware/authenticate';
import {
  validateRegister,
  validateLogin,
  validatePasswordChange,
} from '../middleware/validate';
import { authLimiter } from '../middleware/security';
import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  generateRandomToken,
} from '../utils/helpers';
import { sendEmail, emailTemplates } from '../config/email';
import logger from '../config/logger';
import { AuthenticatedRequest } from '../types';

const router = Router();

// POST /api/v1/auth/register
router.post('/register', authLimiter, validateRegister, async (req: Request, res: Response) => {
  try {
    const { email, password, role } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ success: false, error: 'Email already registered' });
      return;
    }

    const password_hash = await bcrypt.hash(password, 12);
    const verifyToken = generateRandomToken();

    const user = await prisma.user.create({
      data: {
        email,
        password_hash,
        role,
        status: 'PENDING',
        email_verified: false,
      },
    });

    // Create empty profile
    if (role === 'APPLICANT') {
      await prisma.applicantProfile.create({
        data: {
          user_id: user.id,
          first_name: '',
          last_name: '',
        },
      });
    } else if (role === 'EMPLOYER') {
      await prisma.employerProfile.create({
        data: {
          user_id: user.id,
          company_name: '',
        },
      });
      // Free subscription by default
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

    // Send verification email
    try {
      await sendEmail({
        to: email,
        ...emailTemplates.verifyEmail(email.split('@')[0], verifyToken),
      });
    } catch (e) {
      logger.warn('Could not send verification email:', e);
    }

    // Auto-activate in dev
    if (process.env.NODE_ENV === 'development') {
      await prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', email_verified: true },
      });
    }

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.status(201).json({
      success: true,
      message: 'Account created successfully',
      data: {
        token,
        refreshToken,
        user: { id: user.id, email: user.email, role: user.role, status: user.status },
      },
    });
  } catch (error: any) {
    logger.error('Register error:', error);
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// POST /api/v1/auth/login
router.post('/login', authLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        applicantProfile: true,
        employerProfile: true,
        subscription: { where: { status: 'ACTIVE' }, take: 1 },
      },
    });

    if (!user) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ success: false, error: 'Invalid credentials' });
      return;
    }

    if (user.status === 'SUSPENDED') {
      res.status(403).json({ success: false, error: 'Account suspended. Contact support.' });
      return;
    }

    if (user.status === 'PENDING') {
      res.status(403).json({ success: false, error: 'Please verify your email first' });
      return;
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { last_login: new Date() },
    });

    const token = generateToken({ userId: user.id, email: user.email, role: user.role });
    const refreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

    await prisma.refreshToken.create({
      data: {
        token: refreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        token,
        refreshToken,
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
          status: user.status,
          applicantProfile: user.applicantProfile,
          employerProfile: user.employerProfile,
          subscription: user.subscription[0] || null,
        },
      },
    });
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// POST /api/v1/auth/refresh-token
router.post('/refresh-token', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      res.status(400).json({ success: false, error: 'Refresh token required' });
      return;
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expires_at < new Date()) {
      res.status(401).json({ success: false, error: 'Invalid or expired refresh token' });
      return;
    }

    const decoded = verifyRefreshToken(refreshToken);
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user || user.status !== 'ACTIVE') {
      res.status(401).json({ success: false, error: 'User not found or inactive' });
      return;
    }

    await prisma.refreshToken.delete({ where: { token: refreshToken } });

    const newToken = generateToken({ userId: user.id, email: user.email, role: user.role });
    const newRefreshToken = generateRefreshToken({ userId: user.id, email: user.email, role: user.role });

    await prisma.refreshToken.create({
      data: {
        token: newRefreshToken,
        user_id: user.id,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    res.json({ success: true, data: { token: newToken, refreshToken: newRefreshToken } });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid refresh token' });
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { refreshToken } = req.body;
    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken, user_id: req.user!.id },
      });
    }
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// POST /api/v1/auth/forgot-password
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Always return success to prevent email enumeration
    if (user) {
      const token = generateRandomToken();
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store token hash
      await prisma.user.update({
        where: { id: user.id },
        data: {
          // Store in a real app; simplified here
        },
      });

      try {
        await sendEmail({
          to: email,
          ...emailTemplates.resetPassword(email.split('@')[0], token),
        });
      } catch (e) {
        logger.warn('Could not send reset email');
      }
    }

    res.json({ success: true, message: 'If that email exists, a reset link has been sent' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Request failed' });
  }
});

// POST /api/v1/auth/verify-email
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;
    if (!token) {
      res.status(400).json({ success: false, error: 'Token required' });
      return;
    }
    // In production, look up token from DB. Simplified here.
    res.json({ success: true, message: 'Email verified' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        role: true,
        status: true,
        email_verified: true,
        created_at: true,
        last_login: true,
        applicantProfile: true,
        employerProfile: true,
        subscription: {
          where: { status: 'ACTIVE' },
          take: 1,
        },
      },
    });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to get user' });
  }
});

// PUT /api/v1/auth/change-password
router.put('/change-password', authenticate, validatePasswordChange, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { current_password, new_password } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const isValid = await bcrypt.compare(current_password, user.password_hash);
    if (!isValid) { res.status(400).json({ success: false, error: 'Current password incorrect' }); return; }

    const newHash = await bcrypt.hash(new_password, 12);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });

    // Revoke all refresh tokens
    await prisma.refreshToken.deleteMany({ where: { user_id: user.id } });

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Password change failed' });
  }
});

export default router;
