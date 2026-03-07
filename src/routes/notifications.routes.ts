import { Router, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import notificationService from '../services/notification.service';
import { AuthenticatedRequest } from '../types';

const router = Router();

router.use(authenticate);

// GET /api/v1/notifications
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
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
router.get('/unread', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notifications = await notificationService.getUnread(req.user!.id);
    res.json({ success: true, data: notifications, count: notifications.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/:id/read
router.put('/:id/read', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const notification = await notificationService.markRead(req.params.id, req.user!.id);
    res.json({ success: true, data: notification });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/notifications/read-all
router.put('/read-all', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await notificationService.markAllRead(req.user!.id);
    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
