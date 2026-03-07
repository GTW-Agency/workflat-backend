import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import paymentService from '../services/payment.service';
import { AuthenticatedRequest } from '../types';
import express from 'express';

const router = Router();

// POST /api/v1/payments/create-subscription  (raw body needed for Stripe webhook)
router.post('/create-subscription', authenticate, authorize('EMPLOYER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan } = req.body;
    const result = await paymentService.createStripeCheckout(req.user!.id, plan);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/payments/webhook/stripe  (raw body, no JSON parsing)
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    const result = await paymentService.handleStripeWebhook(req.body, signature);
    res.json(result);
  } catch (error: any) {
    res.status(error.statusCode || 400).json({ success: false, error: error.message });
  }
});

// GET /api/v1/payments/history
router.get('/history', authenticate, authorize('EMPLOYER'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const result = await paymentService.getTransactionHistory(req.user!.id, page, limit);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
