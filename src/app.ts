import express from 'express';
import morgan from 'morgan';
import compression from 'compression';
import {
  helmetMiddleware,
  corsMiddleware,
  apiLimiter,
  errorHandler,
  notFound,
} from './middleware/security';

// Routes
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/users.routes';
import jobRoutes from './routes/jobs.routes';
import applicantRoutes from './routes/applicants.routes';
import employerRoutes from './routes/employers.routes';
import adminRoutes from './routes/admin.routes';
import paymentRoutes from './routes/payments.routes';
import notificationRoutes from './routes/notifications.routes';
import contentRoutes from './routes/content.routes';

import logger from './config/logger';

const app = express();

// Security middleware
app.use(helmetMiddleware);
app.use(corsMiddleware);

// Body parsing — IMPORTANT: Stripe webhook needs raw body before json parser
app.use('/api/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Utilities
app.use(compression());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: { write: (msg) => logger.info(msg.trim()) },
}));

// Rate limiting
app.use('/api/', apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
  });
});

// API routes
const API = '/api/v1';
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/users`, userRoutes);
app.use(`${API}/jobs`, jobRoutes);
app.use(`${API}/applicants`, applicantRoutes);
app.use(`${API}/employers`, employerRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/payments`, paymentRoutes);
app.use(`${API}/notifications`, notificationRoutes);
app.use(`${API}/content`, contentRoutes);

// API docs stub
app.get(`${API}`, (_req, res) => {
  res.json({
    success: true,
    message: 'Workflat API v1',
    docs: '/api/v1/docs',
    endpoints: {
      auth: `${API}/auth`,
      users: `${API}/users`,
      jobs: `${API}/jobs`,
      applicants: `${API}/applicants`,
      employers: `${API}/employers`,
      admin: `${API}/admin`,
      payments: `${API}/payments`,
      notifications: `${API}/notifications`,
      content: `${API}/content`,
    },
  });
});

// 404 & error handler (must be last)
app.use(notFound);
app.use(errorHandler);

export default app;
