import { Router, Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import { authenticate } from '../middleware/authenticate';
import { uploadImage } from '../config/cloudinary';

const router = Router();

router.use(authenticate);

// GET /api/v1/users/me
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true, email: true, role: true, status: true,
        email_verified: true, created_at: true, last_login: true,
        applicantProfile: true,
        employerProfile: true,
        subscription: { where: { status: 'ACTIVE' }, take: 1 },
      },
    });
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/users/me
router.put('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Only allow email update here; profile updates go to /applicants or /employers
    const { email } = req.body;
    if (email) {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing && existing.id !== req.user!.id) {
        res.status(409).json({ success: false, error: 'Email already in use' });
        return;
      }
      await prisma.user.update({
        where: { id: req.user!.id },
        data: { email, email_verified: false },
      });
    }
    res.json({ success: true, message: 'Updated successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/users/me/avatar
router.post('/me/avatar', uploadImage.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, error: 'No file' }); return; }
    const url = (req.file as any).secure_url;

    if (req.user!.role === 'APPLICANT') {
      await prisma.applicantProfile.update({ where: { user_id: req.user!.id }, data: { avatar_url: url } });
    } else if (req.user!.role === 'EMPLOYER') {
      await prisma.employerProfile.update({ where: { user_id: req.user!.id }, data: { logo_url: url } });
    }

    res.json({ success: true, data: { url } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/users/me
router.delete('/me', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { password } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) { res.status(404).json({ success: false, error: 'User not found' }); return; }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { res.status(401).json({ success: false, error: 'Incorrect password' }); return; }

    await prisma.user.delete({ where: { id: req.user!.id } });
    res.json({ success: true, message: 'Account deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;