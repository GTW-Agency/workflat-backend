import { NotificationType } from '@prisma/client';
import { Server as SocketServer } from 'socket.io';
import prisma from '../config/database';
import { sendEmail, emailTemplates } from '../config/email';
import logger from '../config/logger';

class NotificationService {
  private io: SocketServer | null = null;

  setSocketServer(io: SocketServer) {
    this.io = io;
  }

  async send(userId: string, notification: {
    type: NotificationType;
    title: string;
    message: string;
    data?: Record<string, any>;
  }) {
    try {
      const saved = await prisma.notification.create({
        data: {
          user_id: userId,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data || {},
        },
      });

      // Real-time push if user is connected
      if (this.io) {
        this.io.to(`user_${userId}`).emit('notification', saved);
      }

      // Email for important notification types
      if (this.shouldSendEmail(notification.type)) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) {
          const emailContent = this.getEmailContent(notification);
          if (emailContent) {
            await sendEmail({ to: user.email, ...emailContent });
          }
        }
      }

      return saved;
    } catch (error) {
      logger.error('Notification send failed:', error);
    }
  }

  async getUnread(userId: string) {
    return prisma.notification.findMany({
      where: { user_id: userId, is_read: false },
      orderBy: { created_at: 'desc' },
    });
  }

  async getAll(userId: string, page = 1, limit = 20) {
    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({
        where: { user_id: userId },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.notification.count({ where: { user_id: userId } }),
    ]);
    return { notifications, total };
  }

  async markRead(notificationId: string, userId: string) {
    return prisma.notification.update({
      where: { id: notificationId, user_id: userId },
      data: { is_read: true },
    });
  }

  async markAllRead(userId: string) {
    return prisma.notification.updateMany({
      where: { user_id: userId, is_read: false },
      data: { is_read: true },
    });
  }

  private shouldSendEmail(type: NotificationType): boolean {
    const emailTypes: NotificationType[] = [
      'INTERVIEW_INVITE',
      'SUBSCRIPTION_EXPIRING',
      'APPLICATION_UPDATE',
      'JOB_STATUS_UPDATE',
    ];
    return emailTypes.includes(type);
  }

  private getEmailContent(notification: { type: NotificationType; title: string; message: string }) {
    return {
      subject: notification.title,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px">
          <h2 style="color:#2563eb">${notification.title}</h2>
          <p>${notification.message}</p>
          <hr style="border:1px solid #e5e7eb;margin:20px 0">
          <p style="color:#9ca3af;font-size:12px">Workflat — The Job Platform</p>
        </div>
      `,
    };
  }
}

export const notificationService = new NotificationService();
export default notificationService;
