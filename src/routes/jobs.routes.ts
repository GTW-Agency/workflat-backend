import { Router, Request, Response } from 'express';
import { authenticate, optionalAuth } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validateJobPost, validatePagination } from '../middleware/validate';
import jobService from '../services/job.service';
import applicationService from '../services/application.service';
import { AuthenticatedRequest } from '../types';
import { uploadResume } from '../config/cloudinary';

const router = Router();

// GET /api/v1/jobs - Public job search
router.get('/', validatePagination, optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await jobService.getJobs(req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/jobs/featured
router.get('/featured', async (_req: Request, res: Response) => {
  try {
    const jobs = await jobService.getFeaturedJobs(6);
    res.json({ success: true, data: jobs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/jobs/:id
router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await jobService.getJobById(req.params.id, req.user?.id);
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/jobs/:id/apply
router.post(
  '/:id/apply',
  authenticate,
  authorize('APPLICANT'),
  uploadResume.single('resume'),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const resumeUrl = (req.file as any)?.path || req.body.resume_url;
      const application = await applicationService.apply(req.user!.id, req.params.id, {
        ...req.body,
        resume_url: resumeUrl,
      });
      res.status(201).json({ success: true, message: 'Application submitted', data: application });
    } catch (error: any) {
      res.status(error.statusCode || 500).json({ success: false, error: error.message });
    }
  }
);

export default router;
