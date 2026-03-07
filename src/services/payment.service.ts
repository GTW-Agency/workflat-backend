import Stripe from 'stripe';
import prisma from '../config/database';
import notificationService from './notification.service';
import logger from '../config/logger';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

const PLAN_PRICES: Record<string, string> = {
  STANDARD: process.env.STRIPE_STANDARD_PRICE_ID || 'price_standard',
  PREMIUM: process.env.STRIPE_PREMIUM_PRICE_ID || 'price_premium',
};

const PLAN_LIMITS = {
  FREE: { jobs_limit: 1, featured_jobs_limit: 0 },
  STANDARD: { jobs_limit: 5, featured_jobs_limit: 1 },
  PREMIUM: { jobs_limit: 999999, featured_jobs_limit: 3 },
};

export class PaymentService {
  async createStripeCheckout(employerId: string, planType: string) {
    if (!['STANDARD', 'PREMIUM'].includes(planType)) {
      throw Object.assign(new Error('Invalid plan type'), { statusCode: 400 });
    }

    const user = await prisma.user.findUnique({ where: { id: employerId } });
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });

    const customer = await this.getOrCreateCustomer(employerId, user.email);

    const session = await stripe.checkout.sessions.create({
      customer,
      line_items: [{ price: PLAN_PRICES[planType], quantity: 1 }],
      mode: 'subscription',
      success_url: `${process.env.FRONTEND_URL}/employer/subscription/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/employer/subscription/cancel`,
      metadata: { employerId, planType },
      allow_promotion_codes: true,
    });

    return { sessionId: session.id, url: session.url };
  }

  async handleStripeWebhook(payload: Buffer, signature: string) {
    let event: Stripe.Event;

    try {
      event = stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );
    } catch (err: any) {
      logger.error('Stripe webhook signature verification failed:', err.message);
      throw Object.assign(new Error('Webhook signature invalid'), { statusCode: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed':
        await this.activateSubscription(event.data.object as Stripe.Checkout.Session);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailure(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionCancelled(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      default:
        logger.info(`Unhandled Stripe event: ${event.type}`);
    }

    return { received: true };
  }

  private async activateSubscription(session: Stripe.Checkout.Session) {
    const { employerId, planType } = session.metadata as Record<string, string>;
    const limits = PLAN_LIMITS[planType as keyof typeof PLAN_LIMITS];

    await prisma.$transaction(async (tx) => {
      // Deactivate existing subscriptions
      await tx.subscription.updateMany({
        where: { employer_id: employerId, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });

      const subscription = await tx.subscription.create({
        data: {
          employer_id: employerId,
          plan_type: planType as any,
          status: 'ACTIVE',
          stripe_subscription_id: session.subscription as string,
          start_date: new Date(),
          end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          jobs_limit: limits.jobs_limit,
          featured_jobs_limit: limits.featured_jobs_limit,
          jobs_used: 0,
          featured_jobs_used: 0,
        },
      });

      await tx.transaction.create({
        data: {
          employer_id: employerId,
          subscription_id: subscription.id,
          amount: (session.amount_total || 0) / 100,
          currency: session.currency?.toUpperCase() || 'USD',
          payment_method: 'STRIPE',
          payment_provider_id: session.payment_intent as string,
          status: 'COMPLETED',
          description: `${planType} Plan Subscription`,
        },
      });
    });

    await notificationService.send(employerId, {
      type: 'SUBSCRIPTION_ACTIVATED',
      title: 'Subscription Activated!',
      message: `Your ${planType} plan is now active. Happy hiring!`,
    });

    logger.info(`Subscription activated for employer: ${employerId}, plan: ${planType}`);
  }

  private async handlePaymentFailure(invoice: Stripe.Invoice) {
    const customerId = invoice.customer as string;
    const user = await this.getUserByStripeCustomer(customerId);
    if (user) {
      await notificationService.send(user.id, {
        type: 'SUBSCRIPTION_EXPIRING',
        title: 'Payment Failed',
        message: 'Your subscription payment failed. Please update your payment method.',
      });
    }
  }

  private async handleSubscriptionCancelled(subscription: Stripe.Subscription) {
    await prisma.subscription.updateMany({
      where: { stripe_subscription_id: subscription.id },
      data: { status: 'CANCELLED' },
    });
  }

  private async handleSubscriptionUpdated(subscription: Stripe.Subscription) {
    logger.info(`Subscription updated: ${subscription.id}`);
  }

  async cancelSubscription(employerId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { employer_id: employerId, status: 'ACTIVE' },
    });

    if (!subscription) throw Object.assign(new Error('No active subscription'), { statusCode: 404 });

    if (subscription.stripe_subscription_id) {
      await stripe.subscriptions.cancel(subscription.stripe_subscription_id);
    }

    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { status: 'CANCELLED' },
    });

    return { message: 'Subscription cancelled successfully' };
  }

  async getTransactionHistory(employerId: string, page = 1, limit = 10) {
    const [transactions, total] = await Promise.all([
      prisma.transaction.findMany({
        where: { employer_id: employerId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.transaction.count({ where: { employer_id: employerId } }),
    ]);

    return { transactions, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  private async getOrCreateCustomer(employerId: string, email: string): Promise<string> {
    const subscription = await prisma.subscription.findFirst({
      where: { employer_id: employerId, stripe_subscription_id: { not: null } },
    });

    if (subscription?.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(subscription.stripe_subscription_id);
      return sub.customer as string;
    }

    const customer = await stripe.customers.create({
      email,
      metadata: { employerId },
    });

    return customer.id;
  }

  private async getUserByStripeCustomer(customerId: string) {
    const subscription = await prisma.subscription.findFirst({
      where: { stripe_subscription_id: { contains: customerId } },
      include: { employer: true },
    });
    return subscription?.employer || null;
  }
}

export const paymentService = new PaymentService();
export default paymentService;
