// src/routes/payments.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { PaymentService } from '../services/paymentService';
import { prisma } from '../config/prisma';

const router = Router();
const paymentService = new PaymentService();

// Stripe webhook — raw body, no auth
router.post('/webhook/stripe', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    await paymentService.handleStripeWebhook(req.body, signature);
    res.json({ received: true });
  } catch (err) { next(err); }
});

// Transaction history — authenticated
router.get('/history', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { employer_id: req.user!.id },
      orderBy: { created_at: 'desc' },
    });
    res.json(transactions);
  } catch (err) { next(err); }
});

export default router;
