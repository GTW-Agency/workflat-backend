import Stripe from 'stripe';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { notificationService } from './notificationService';
import logger from '../config/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });

const PLAN_PRICES: Record<string, string> = {
  STANDARD: process.env.STRIPE_PRICE_STANDARD || '',
  PREMIUM:  process.env.STRIPE_PRICE_PREMIUM  || '',
};

const PLAN_LIMITS = {
  STANDARD: { jobs_limit: 5,      featured_jobs_limit: 1 },
  PREMIUM:  { jobs_limit: 999999, featured_jobs_limit: 3 },
};

export class PaymentService {
  // ─── Create Stripe Checkout Session ─────────────────────
  async createStripeSubscription(employerId: string, planType: 'STANDARD' | 'PREMIUM') {
    const priceId = PLAN_PRICES[planType];
    if (!priceId) throw new AppError(`Price not configured for plan: ${planType}`, 500);

    const customerId = await this.getOrCreateStripeCustomer(employerId);

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/employer/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/employer/subscription/cancel`,
      metadata: { employerId, planType },
    });

    return { sessionId: session.id, url: session.url };
  }

  // ─── Handle Stripe Webhook ───────────────────────────────
  async handleStripeWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(payload, signature, process.env.STRIPE_WEBHOOK_SECRET!);
    } catch (err: any) {
      throw new AppError(`Webhook signature verification failed: ${err.message}`, 400);
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.activateSubscription(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.cancelSubscription(event.data.object as Stripe.Subscription);
        break;
      default:
        logger.info(`Unhandled Stripe event: ${event.type}`);
    }
  }

  // ─── Activate Subscription ───────────────────────────────
  private async activateSubscription(session: Stripe.Checkout.Session) {
    const { employerId, planType } = session.metadata as { employerId: string; planType: 'STANDARD' | 'PREMIUM' };
    const limits = PLAN_LIMITS[planType];

    // Fixed: Added type annotation for tx parameter
    await prisma.$transaction(async (tx: any) => {
      // Deactivate old subscriptions
      await tx.subscription.updateMany({
        where: { employer_id: employerId, status: 'ACTIVE' },
        data: { status: 'EXPIRED' },
      });

      // Create new subscription
      await tx.subscription.create({
        data: {
          employer_id: employerId,
          plan_type: planType,
          status: 'ACTIVE',
          stripe_subscription_id: session.subscription as string,
          start_date: new Date(),
          end_date: new Date(Date.now() + 30 * 86400000),
          jobs_limit: limits.jobs_limit,
          featured_jobs_limit: limits.featured_jobs_limit,
        },
      });

      // Record transaction
      await tx.transaction.create({
        data: {
          employer_id: employerId,
          amount: (session.amount_total ?? 0) / 100,
          currency: session.currency || 'usd',
          payment_method: 'STRIPE',
          payment_provider_id: session.payment_intent as string,
          status: 'COMPLETED',
          description: `${planType} Plan Subscription`,
        },
      });
    });

    await notificationService.send(employerId, {
      type: 'SUBSCRIPTION_ACTIVATED',
      title: 'Subscription Activated',
      message: `Your ${planType} plan is now active!`,
    });
  }

  private async handlePaymentFailure(invoice: Stripe.Invoice) {
    logger.warn(`Payment failed for invoice ${invoice.id}`);
    // Optionally notify the employer
  }

  private async cancelSubscription(sub: Stripe.Subscription) {
    await prisma.subscription.updateMany({
      where: { stripe_subscription_id: sub.id },
      data: { status: 'CANCELLED' },
    });
  }

  // ─── Get or Create Stripe Customer ──────────────────────
  private async getOrCreateStripeCustomer(employerId: string): Promise<string> {
    const user = await prisma.user.findUnique({ where: { id: employerId } });
    if (!user) throw new AppError('User not found', 404);

    // Check if customer exists already via existing subscription
    const existing = await prisma.subscription.findFirst({
      where: { employer_id: employerId, stripe_subscription_id: { not: null } },
    });

    if (existing?.stripe_subscription_id) {
      const stripeSub = await stripe.subscriptions.retrieve(existing.stripe_subscription_id);
      return stripeSub.customer as string;
    }

    const customer = await stripe.customers.create({ email: user.email, metadata: { employerId } });
    return customer.id;
  }
}