import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { JobService } from '../services/jobService';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const jobService = new JobService();

// All admin routes require ADMIN role
router.use(authenticate, authorize('ADMIN'));

// GET /api/v1/admin/dashboard
router.get('/dashboard', async (_req, res, next) => {
  try {
    const [totalUsers, totalJobs, totalApplications, activeSubscriptions, revenueData] = await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.application.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.aggregate({
        where: {
          created_at: { gte: new Date(Date.now() - 30 * 86400000) },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      totalUsers,
      totalJobs,
      totalApplications,
      activeSubscriptions,
      revenueThisMonth: revenueData._sum.amount || 0,
    });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/jobs — list all jobs with filters
router.get('/jobs', async (req, res, next) => {
  try {
    const status = req.query.status as string | undefined;
    const jobs = await prisma.job.findMany({
      where: status ? { status: status as any } : undefined,
      include: { employer: { select: { company_name: true } } },
      orderBy: { created_at: 'desc' },
    });
    res.json(jobs);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/jobs/:id/approve
router.put('/jobs/:id/approve', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.reviewJob(req.user!.id, req.params.id, true);
    res.json(job);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/jobs/:id/reject
router.put('/jobs/:id/reject', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await jobService.reviewJob(req.user!.id, req.params.id, false, req.body.reason);
    res.json(job);
  } catch (err) { next(err); }
});

// DELETE /api/v1/admin/jobs/:id
router.delete('/jobs/:id', async (req, res, next) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ message: 'Job deleted' });
  } catch (err) { next(err); }
});

// GET /api/v1/admin/users
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, status: true, created_at: true, last_login: true },
      orderBy: { created_at: 'desc' },
    });
    res.json(users);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/users/:id/status
router.put('/users/:id/status', async (req, res, next) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      throw new AppError('Invalid status', 400);
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, email: true, status: true },
    });
    res.json(user);
  } catch (err) { next(err); }
});

// PUT /api/v1/admin/employers/:id/verify
router.put('/employers/:id/verify', async (req, res, next) => {
  try {
    const profile = await prisma.employerProfile.update({
      where: { id: req.params.id },
      data: { verification_status: req.body.status || 'VERIFIED' },
    });
    res.json(profile);
  } catch (err) { next(err); }
});

export default router;
