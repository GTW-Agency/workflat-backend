import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/authenticate';
import notificationService from '../services/notification.service';

const router = Router();

router.use(authenticate);

// GET /api/v1/notifications
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const result = await notificationService.getAll(req.user!.id, page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/notifications/unread
router.get('/unread', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notifications = await notificationService.getUnread(req.user!.id);
    res.json({ success: true, data: notifications, count: notifications.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user!.id);
    res.json({ success: true, data: notification });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await notificationService.markAllRead(req.user!.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;