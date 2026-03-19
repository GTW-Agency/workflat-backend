import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validateJobPost, validatePagination, validateContent } from '../middleware/validate';
import jobService from '../services/job.service';
import analyticsService from '../services/analytics.service';
import { AuthenticatedRequest } from '../types';
import { slugify } from '../utils/helpers';
import logger from '../config/logger';

const router = Router();

router.use(authenticate, authorize('ADMIN'));

// GET /api/v1/admin/dashboard
router.get('/dashboard', async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await analyticsService.getAdminDashboard();
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/users
router.get('/users', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await analyticsService.getAdminUsers(req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/users/:id
router.get('/users/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        applicantProfile: true,
        employerProfile: true,
        subscription: { orderBy: { created_at: 'desc' }, take: 1 },
        transactions: { orderBy: { created_at: 'desc' }, take: 10 },
      },
    });
    if (!user) { 
      res.status(404).json({ success: false, error: 'User not found' }); 
      return; 
    }
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/users/:id/applicant-profile - Get detailed applicant profile
router.get('/users/:id/applicant-profile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        applicantProfile: {
          include: {
            applications: {
              include: {
                job: {
                  select: {
                    id: true,
                    title: true,
                    employer: {
                      select: {
                        company_name: true
                      }
                    }
                  }
                }
              },
              orderBy: { applied_at: 'desc' },
              take: 10
            },
            saved_jobs: {
              include: {
                job: {
                  select: {
                    id: true,
                    title: true,
                    employer: {
                      select: {
                        company_name: true
                      }
                    }
                  }
                }
              },
              take: 10
            }
          }
        }
      }
    });

    if (!user) {
      res.status(404).json({ success: false, error: 'User not found' });
      return;
    }

    if (!user.applicantProfile) {
      res.status(404).json({ success: false, error: 'Applicant profile not found' });
      return;
    }

    res.json({ 
      success: true, 
      data: {
        ...user,
        applicantProfile: user.applicantProfile
      }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/admin/users/:id/status
router.put('/users/:id/status', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['ACTIVE', 'SUSPENDED', 'PENDING'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status' });
      return;
    }
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { status },
      select: { id: true, email: true, status: true },
    });
    logger.info(`Admin updated user ${req.params.id} status to ${status}`);
    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/jobs
router.get('/jobs', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await jobService.getAdminJobs(req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/admin/jobs
router.post('/jobs', validateJobPost, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await jobService.createJob(req.user!.id, req.body, true);
    res.status(201).json({ success: true, data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/admin/jobs/:id/approve
router.put('/jobs/:id/approve', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await jobService.approveJob(req.user!.id, req.params.id, true);
    res.json({ success: true, message: 'Job approved', data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/admin/jobs/:id/reject
router.put('/jobs/:id/reject', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { reason } = req.body;
    if (!reason) { 
      res.status(400).json({ success: false, error: 'Rejection reason required' }); 
      return; 
    }
    const job = await jobService.rejectJob(req.user!.id, req.params.id, reason);
    res.json({ success: true, message: 'Job rejected', data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/admin/jobs/:id
router.delete('/jobs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.job.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Job deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/employers
router.get('/employers', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;

    const [employers, total] = await Promise.all([
      prisma.employerProfile.findMany({
        include: {
          user: { select: { id: true, email: true, status: true, created_at: true } },
          _count: { select: { jobs: true } },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.employerProfile.count(),
    ]);

    res.json({
      success: true,
      data: employers,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/admin/employers/:id/verify
router.put('/employers/:id/verify', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    if (!['VERIFIED', 'REJECTED'].includes(status)) {
      res.status(400).json({ success: false, error: 'Invalid status' });
      return;
    }
    const employer = await prisma.employerProfile.update({
      where: { id: req.params.id },
      data: { verification_status: status },
    });
    res.json({ success: true, data: employer });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/admin/content
router.get('/content', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { type, status, page = 1, limit = 20 } = req.query;
    const where: any = {};
    if (type) where.type = type;
    if (status) where.status = status;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

    const [content, total] = await Promise.all([
      prisma.content.findMany({
        where,
        include: { author: { select: { email: true } } },
        orderBy: { created_at: 'desc' },
        skip: (pageNum - 1) * limitNum,
        take: limitNum,
      }),
      prisma.content.count({ where }),
    ]);

    res.json({
      success: true,
      data: content,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/admin/content
router.post('/content', validateContent, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = {
      ...req.body,
      author_id: req.user!.id,
      slug: req.body.slug || slugify(req.body.title),
      published_at: req.body.status === 'PUBLISHED' ? new Date() : null,
    };
    const content = await prisma.content.create({ data });
    res.status(201).json({ success: true, data: content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/admin/content/:id
router.put('/content/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updateData = { ...req.body };
    if (updateData.status === 'PUBLISHED') {
      const existing = await prisma.content.findUnique({ where: { id: req.params.id } });
      if (!existing?.published_at) updateData.published_at = new Date();
    }
    const content = await prisma.content.update({
      where: { id: req.params.id },
      data: updateData,
    });
    res.json({ success: true, data: content });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/admin/content/:id
router.delete('/content/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.content.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Content deleted' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;