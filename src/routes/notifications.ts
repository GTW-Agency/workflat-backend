// src/routes/notifications.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/prisma';

const router = Router();
router.use(authenticate);

router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await prisma.notification.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    res.json(notifications);
  } catch (err) { next(err); }
});

router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.update({
      where: { id: req.params.id },
      data: { is_read: true },
    });
    res.json({ message: 'Marked as read' });
  } catch (err) { next(err); }
});

router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user!.id, is_read: false },
      data: { is_read: true },
    });
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { next(err); }
});

export default router;
