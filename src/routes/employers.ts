import { Router, Request, Response, NextFunction } from 'express';
import { body } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import { JobService } from '../services/jobService';
import { PaymentService } from '../services/paymentService';
import { prisma } from '../config/prisma';

const router = Router();
const jobService = new JobService();
const paymentService = new PaymentService();

router.use(authenticate, authorize('EMPLOYER'));

// GET /api/v1/employers/dashboard
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = req.user!.employerProfile;
    if (!profile) { res.status(404).json({ error: 'Employer profile not found' }); return; }

    const jobs = await prisma.job.findMany({
      where: { employer_id: profile.id },
      include: { _count: { select: { applications: true } } },
    });

    // Fixed: Add types to reduce parameters
    const totalViews = jobs.reduce((sum: number, j: any) => sum + j.view_count, 0);
    const totalApplications = jobs.reduce((sum: number, j: any) => sum + j._count.applications, 0);

    res.json({
      activeJobs: jobs.filter((j: any) => j.status === 'ACTIVE').length,
      totalViews,
      totalApplications,
      // Fixed: Add type to map parameter
      jobsPerformance: jobs.map((j: any) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        views: j.view_count,
        applications: j._count.applications,
      })),
    });
  } catch (err) { next(err); }
});

// GET /api/v1/employers/jobs
router.get('/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await prisma.job.findMany({
      where: { employer_id: req.user!.employerProfile?.id },
      orderBy: { created_at: 'desc' },
    });
    res.json(jobs);
  } catch (err) { next(err); }
});

// POST /api/v1/employers/jobs
router.post(
  '/jobs',
  [
    body('title').trim().isLength({ min: 5, max: 100 }),
    body('description').trim().isLength({ min: 50 }),
    body('location').trim().notEmpty(),
    body('salary_min').optional().isInt({ min: 0 }),
    body('salary_max').optional().isInt({ min: 0 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await jobService.createJob(req.user!.id, req.body, false);
      res.status(201).json(job);
    } catch (err) { next(err); }
  }
);

// GET /api/v1/employers/jobs/:id/applications
router.get('/jobs/:id/applications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findFirst({
      where: { id: req.params.id, employer_id: req.user!.employerProfile?.id },
    });
    if (!job) { res.status(404).json({ error: 'Job not found' }); return; }

    const applications = await prisma.application.findMany({
      where: { job_id: job.id },
      include: { applicant: { select: { first_name: true, last_name: true, avatar_url: true, resume_url: true } } },
      orderBy: { applied_at: 'desc' },
    });

    res.json(applications);
  } catch (err) { next(err); }
});

// PUT /api/v1/employers/applications/:id/status
router.put('/applications/:id/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const application = await prisma.application.update({
      where: { id: req.params.id },
      data: { status: req.body.status, employer_notes: req.body.notes },
    });
    res.json(application);
  } catch (err) { next(err); }
});

// POST /api/v1/employers/subscription/upgrade
router.post('/subscription/upgrade', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { planType } = req.body;
    if (!['STANDARD', 'PREMIUM'].includes(planType)) {
      res.status(400).json({ error: 'Invalid plan type' }); return;
    }
    const result = await paymentService.createStripeSubscription(req.user!.id, planType);
    res.json(result);
  } catch (err) { next(err); }
});


export default router;