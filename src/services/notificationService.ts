import { Server as SocketIOServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import nodemailer from 'nodemailer';
import { prisma } from '../config/prisma';
import { NotificationType } from '@prisma/client';
import  logger  from '../config/logger';

const EMAIL_TYPES: NotificationType[] = [
  'INTERVIEW_INVITE',
  'SUBSCRIPTION_EXPIRING',
  'APPLICATION_UPDATE',
];

// Nodemailer transporter (lazy-initialized)
const getTransporter = () =>
  nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

class NotificationService {
  private io: SocketIOServer | null = null;

  setIO(io: SocketIOServer) {
    this.io = io;
  }

  async send(userId: string, notification: { type: NotificationType; title: string; message: string; data?: object }) {
    // Persist to DB
    const saved = await prisma.notification.create({
      data: { user_id: userId, ...notification },
    });

    // Real-time push if user is connected
    if (this.io) {
      this.io.to(`user_${userId}`).emit('notification', saved);
    }

    // Email for important events
    if (EMAIL_TYPES.includes(notification.type)) {
      this.sendEmail(userId, notification).catch((err) =>
        logger.error(`Email send failed for user ${userId}: ${err.message}`)
      );
    }

    return saved;
  }

  private async sendEmail(userId: string, notification: { title: string; message: string }) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;

    await getTransporter().sendMail({
      from: process.env.SMTP_FROM || 'no-reply@workflat.com',
      to: user.email,
      subject: notification.title,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 24px;">
          <h2 style="color: #1a1a1a;">${notification.title}</h2>
          <p style="color: #555;">${notification.message}</p>
          <hr style="border: none; border-top: 1px solid #eee;" />
          <p style="color: #999; font-size: 12px;">Workflat – Your career platform</p>
        </div>
      `,
    });
  }
}

export const notificationService = new NotificationService();

export function setupSocketIO(io: SocketIOServer) {
  notificationService.setIO(io);

  io.on('connection', (socket) => {
    socket.on('authenticate', (token: string) => {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { userId: string };
        socket.join(`user_${decoded.userId}`);
        logger.info(`Socket authenticated: user_${decoded.userId}`);
      } catch {
        socket.disconnect();
      }
    });

    socket.on('disconnect', () => {
      logger.info('Socket disconnected');
    });
  });
}
