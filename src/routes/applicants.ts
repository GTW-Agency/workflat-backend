// src/routes/applicants.ts
import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../config/prisma';

const router = Router();
router.use(authenticate, authorize('APPLICANT'));

router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = req.user!.applicantProfile;
    if (!profile) { res.status(404).json({ error: 'Profile not found' }); return; }

    const [applications, savedJobs] = await Promise.all([
      prisma.application.findMany({
        where: { applicant_id: profile.id },
        include: { job: { select: { title: true, location: true } } },
        orderBy: { applied_at: 'desc' },
        take: 5,
      }),
      prisma.savedJob.count({ where: { applicant_id: profile.id } }),
    ]);

    res.json({ applications, savedJobsCount: savedJobs });
  } catch (err) { next(err); }
});

router.get('/applications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const applications = await prisma.application.findMany({
      where: { applicant_id: req.user!.applicantProfile?.id },
      include: { job: { select: { title: true, location: true, employer: { select: { company_name: true } } } } },
      orderBy: { applied_at: 'desc' },
    });
    res.json(applications);
  } catch (err) { next(err); }
});

router.post('/saved-jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const saved = await prisma.savedJob.create({
      data: { applicant_id: req.user!.applicantProfile!.id, job_id: req.params.jobId },
    });
    res.status(201).json(saved);
  } catch (err) { next(err); }
});

router.delete('/saved-jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await prisma.savedJob.deleteMany({
      where: { applicant_id: req.user!.applicantProfile!.id, job_id: req.params.jobId },
    });
    res.json({ message: 'Removed from saved jobs' });
  } catch (err) { next(err); }
});

export default router;
