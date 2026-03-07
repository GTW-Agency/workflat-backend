import 'dotenv/config';
import http from 'http';
import { Server as SocketServer } from 'socket.io';
import jwt from 'jsonwebtoken';
import app from './app';
import { connectDatabase } from './config/database';
import notificationService from './services/notification.service';
import logger from './config/logger';

const PORT = process.env.PORT || 8000;

const httpServer = http.createServer(app);

// Socket.IO setup
const io = new SocketServer(httpServer, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Connect notification service to Socket.IO
notificationService.setSocketServer(io);

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id}`);

  // Authenticate socket connection
  socket.on('authenticate', (token: string) => {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      socket.join(`user_${decoded.userId}`);
      socket.emit('authenticated', { userId: decoded.userId });
      logger.info(`Socket authenticated for user: ${decoded.userId}`);
    } catch (err) {
      socket.emit('auth_error', { message: 'Invalid token' });
      socket.disconnect();
    }
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// Graceful shutdown
const gracefulShutdown = (signal: string) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  httpServer.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled errors
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

// Boot
const start = async () => {
  await connectDatabase();
  httpServer.listen(PORT, () => {
    logger.info(`🚀 Workflat API running on port ${PORT}`);
    logger.info(`📖 Environment: ${process.env.NODE_ENV}`);
    logger.info(`🔗 Health: http://localhost:${PORT}/health`);
    logger.info(`📡 API: http://localhost:${PORT}/api/v1`);
  });
};

start();
