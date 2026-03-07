import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { prisma } from '../config/prisma';
import { uploadResume, uploadImage } from '../config/cloudinary';
import applicationService from '../services/application.service';
import analyticsService from '../services/analytics.service';

const router = Router();
router.use(authenticate, authorize('APPLICANT'));

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Returns the applicant profile attached by auth middleware, or sends 404. */
function requireProfile(req: Request, res: Response) {
  const profile = req.user?.applicantProfile;
  if (!profile) {
    res.status(404).json({ success: false, error: 'Applicant profile not found' });
    return null;
  }
  return profile;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

// GET /api/v1/applicants/dashboard
router.get('/dashboard', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const data = await analyticsService.getApplicantDashboard(req.user!.id);
    res.json({ success: true, data });
  } catch (err) { next(err); }
});

// ─── Profile ─────────────────────────────────────────────────────────────────

// GET /api/v1/applicants/profile
router.get('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Profile is already loaded by authenticate middleware — no extra DB hit needed.
    const profile = req.user?.applicantProfile ?? null;
    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// Whitelist of every writable ApplicantProfile field (mirrors the Prisma schema).
// Anything not in this list is silently dropped, preventing unknown-field errors
// when clients send stale or extra keys (e.g. the old `salary_expectation`).
const ALLOWED_PROFILE_FIELDS = new Set([
  'first_name', 'last_name', 'phone', 'nationality', 'location', 'title',
  'bio', 'skills', 'years_experience', 'education', 'linkedin_url',
  'portfolio_url', 'experience_level', 'desired_salary', 'preferred_locations',
  'visa_status', 'relocation_ready', 'resume_url', 'avatar_url',
]);

// PUT /api/v1/applicants/profile
router.put('/profile', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const raw = req.body as Record<string, unknown>;

    // Remap legacy field names sent by older clients.
    if ('salary_expectation' in raw && !('desired_salary' in raw)) {
      raw.desired_salary = typeof raw.salary_expectation === 'string'
        ? parseInt(raw.salary_expectation, 10) || null
        : raw.salary_expectation;
    }

    // Strip any key not recognised by the schema.
    const profileData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (ALLOWED_PROFILE_FIELDS.has(key)) profileData[key] = value;
    }

    // Calculate profile completion against known completeness fields.
    const completenessFields = [
      'first_name', 'last_name', 'phone', 'location',
      'bio', 'skills', 'experience_level', 'resume_url',
    ];
    const existing = req.user?.applicantProfile ?? {};
    const merged = { ...existing, ...profileData };
    const filled = completenessFields.filter(
      (f) => merged[f as keyof typeof merged] &&
        (Array.isArray(merged[f as keyof typeof merged])
          ? (merged[f as keyof typeof merged] as unknown[]).length > 0
          : true)
    ).length;
    profileData.profile_completion = Math.round((filled / completenessFields.length) * 100);

    const profile = await prisma.applicantProfile.upsert({
      where: { user_id: userId },
      update: profileData,
      create: { user_id: userId, first_name: '', last_name: '', ...profileData },
    });

    res.json({ success: true, data: profile });
  } catch (err) { next(err); }
});

// POST /api/v1/applicants/profile/resume
router.post(
  '/profile/resume',
  uploadResume.single('resume'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const resumeUrl = (req.file as any).path;

      // Upsert so the route works even if the profile row doesn't exist yet.
      await prisma.applicantProfile.upsert({
        where: { user_id: req.user!.id },
        update: { resume_url: resumeUrl },
        create: { user_id: req.user!.id, first_name: '', last_name: '', resume_url: resumeUrl },
      });

      res.json({ success: true, data: { resume_url: resumeUrl } });
    } catch (err) { next(err); }
  }
);

// POST /api/v1/applicants/profile/avatar
router.post(
  '/profile/avatar',
  uploadImage.single('avatar'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'No file uploaded' });
        return;
      }

      const avatarUrl = (req.file as any).secure_url;

      // FIX: was `update` — fails when profile row doesn't exist yet.
      // `upsert` handles both first-time upload and subsequent updates.
      await prisma.applicantProfile.upsert({
        where: { user_id: req.user!.id },
        update: { avatar_url: avatarUrl },
        create: { user_id: req.user!.id, first_name: '', last_name: '', avatar_url: avatarUrl },
      });

      res.json({ success: true, data: { avatar_url: avatarUrl } });
    } catch (err) { next(err); }
  }
);

// ─── Applications ─────────────────────────────────────────────────────────────

// GET /api/v1/applicants/applications
router.get('/applications', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await applicationService.getApplicantApplications(req.user!.id, req.query);
    res.json({ success: true, ...result });
  } catch (err) { next(err); }
});

// GET /api/v1/applicants/applications/:id
router.get('/applications/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = requireProfile(req, res);
    if (!profile) return;

    const application = await prisma.application.findFirst({
      where: { id: req.params.id, applicant_id: profile.id },
      include: {
        job: {
          include: {
            employer: { select: { company_name: true, logo_url: true, website: true } },
          },
        },
      },
    });

    if (!application) {
      res.status(404).json({ success: false, error: 'Application not found' });
      return;
    }

    res.json({ success: true, data: application });
  } catch (err) { next(err); }
});

// PUT /api/v1/applicants/applications/:id/withdraw
router.put('/applications/:id/withdraw', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await applicationService.withdrawApplication(req.params.id, req.user!.id);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

// ─── Saved Jobs ───────────────────────────────────────────────────────────────

// GET /api/v1/applicants/saved-jobs
router.get('/saved-jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = requireProfile(req, res);
    if (!profile) return;

    const page  = Math.max(1, parseInt(req.query.page  as string) || 1);
    const limit = Math.min(50, parseInt(req.query.limit as string) || 10);

    const [saved, total] = await Promise.all([
      prisma.savedJob.findMany({
        where: { applicant_id: profile.id },
        include: {
          job: { include: { employer: { select: { company_name: true, logo_url: true } } } },
        },
        orderBy: { saved_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.savedJob.count({ where: { applicant_id: profile.id } }),
    ]);

    res.json({
      success: true,
      data: saved,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) { next(err); }
});

// POST /api/v1/applicants/saved-jobs/:jobId
router.post('/saved-jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = requireProfile(req, res);
    if (!profile) return;

    const saved = await prisma.savedJob.upsert({
      where: { applicant_id_job_id: { applicant_id: profile.id, job_id: req.params.jobId } },
      update: {},
      create: { applicant_id: profile.id, job_id: req.params.jobId },
    });

    res.status(201).json({ success: true, data: saved });
  } catch (err) { next(err); }
});

// DELETE /api/v1/applicants/saved-jobs/:jobId
router.delete('/saved-jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const profile = requireProfile(req, res);
    if (!profile) return;

    await prisma.savedJob.deleteMany({
      where: { applicant_id: profile.id, job_id: req.params.jobId },
    });

    res.json({ success: true, message: 'Job unsaved' });
  } catch (err) { next(err); }
});

export default router;