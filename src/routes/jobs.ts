import { Router, Request, Response, NextFunction } from 'express';
import { body, query } from 'express-validator';
import { validate } from '../middleware/validate';
import { authenticate, authorize } from '../middleware/auth';
import { JobService } from '../services/jobService';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

const router = Router();
const jobService = new JobService();

// GET /api/v1/jobs — public search
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await jobService.searchJobs({
      query: req.query.q as string,
      location: req.query.location as string,
      category: req.query.category as string,
      employment_type: req.query.employment_type as string,
      salary_min: req.query.salary_min ? parseInt(req.query.salary_min as string) : undefined,
      salary_max: req.query.salary_max ? parseInt(req.query.salary_max as string) : undefined,
      remote_only: req.query.remote === 'true',
      page: req.query.page ? parseInt(req.query.page as string) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
    });
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/v1/jobs/featured — public
router.get('/featured', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const jobs = await jobService.getFeaturedJobs();
    res.json(jobs);
  } catch (err) { next(err); }
});

// GET /api/v1/jobs/:id — public
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.id },
      include: { employer: true },
    });
    if (!job || job.status !== 'ACTIVE') throw new AppError('Job not found', 404);

    // Increment view count
    await prisma.job.update({ where: { id: job.id }, data: { view_count: { increment: 1 } } });

    res.json(job);
  } catch (err) { next(err); }
});

// POST /api/v1/jobs/:id/apply — authenticated applicants
router.post(
  '/:id/apply',
  authenticate,
  authorize('APPLICANT'),
  [
    body('cover_letter').optional().isLength({ max: 5000 }),
  ],
  validate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const job = await prisma.job.findUnique({ where: { id: req.params.id } });
      if (!job || job.status !== 'ACTIVE') throw new AppError('Job not found or not accepting applications', 404);

      if (job.application_method === 'EXTERNAL') {
        throw new AppError('This job uses an external application process', 400);
      }

      const profile = req.user!.applicantProfile;
      if (!profile) throw new AppError('Applicant profile not found', 404);

      // Prevent duplicate applications
      const existing = await prisma.application.findFirst({
        where: { job_id: job.id, applicant_id: profile.id },
      });
      if (existing) throw new AppError('You have already applied to this job', 409);

      const application = await prisma.application.create({
        data: {
          job_id: job.id,
          applicant_id: profile.id,
          cover_letter: req.body.cover_letter,
          resume_url: req.body.resume_url || profile.resume_url,
          answers: req.body.answers,
        },
      });

      // Increment application count
      await prisma.job.update({ where: { id: job.id }, data: { application_count: { increment: 1 } } });

      res.status(201).json(application);
    } catch (err) { next(err); }
  }
);

export default router;
