import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { AuthService } from '../services/authService';
import { authLimiter } from '../middleware/rateLimiter';
import { authenticate } from '../middleware/auth';

const router = Router();
const authService = new AuthService();

// POST /api/v1/auth/register
router.post(
  '/register',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('role').isIn(['EMPLOYER', 'APPLICANT']).withMessage('Role must be EMPLOYER or APPLICANT'),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const user = await authService.register(req.body);
      res.status(201).json({ message: 'Registration successful. Please verify your email.', userId: user.id });
    } catch (err) { next(err); }
  }
);

// POST /api/v1/auth/login
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// POST /api/v1/auth/refresh-token
router.post(
  '/refresh-token',
  body('refreshToken').notEmpty(),
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const tokens = await authService.refreshToken(req.body.refreshToken);
      res.json(tokens);
    } catch (err) { next(err); }
  }
);

// POST /api/v1/auth/logout (client just discards tokens, but server-side you can blacklist if needed)
router.post('/logout', authenticate, (_req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
