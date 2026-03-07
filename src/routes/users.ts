// src/routes/users.ts
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { uploadImage } from '../config/upload';

const router = Router();
router.use(authenticate);

router.get('/me', (req, res) => {
  const { password_hash, ...user } = req.user as any;
  res.json(user);
});

router.put('/me', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.user!.id },
      data: { updated_at: new Date() },
      select: { id: true, email: true, role: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

router.post('/me/avatar', uploadImage.single('avatar'), async (req, res, next) => {
  try {
    if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }
    const avatarUrl = (req.file as any).path;

    if (req.user!.role === 'APPLICANT' && req.user!.applicantProfile) {
      await prisma.applicantProfile.update({
        where: { id: req.user!.applicantProfile.id },
        data: { avatar_url: avatarUrl },
      });
    } else if (req.user!.role === 'EMPLOYER' && req.user!.employerProfile) {
      await prisma.employerProfile.update({
        where: { id: req.user!.employerProfile.id },
        data: { logo_url: avatarUrl },
      });
    }

    res.json({ url: avatarUrl });
  } catch (err) { next(err); }
});

export default router;
