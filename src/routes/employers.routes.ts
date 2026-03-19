import { Router, Response } from 'express';
import prisma from '../config/database';
import { authenticate } from '../middleware/authenticate';
import { authorize } from '../middleware/authorize';
import { validateJobPost, validatePagination, validateUpdateApplicationStatus, validateInterviewSchedule } from '../middleware/validate';
import jobService from '../services/job.service';
import applicationService from '../services/application.service';
import analyticsService from '../services/analytics.service';
import paymentService from '../services/payment.service';
import { AuthenticatedRequest } from '../types';
import { uploadImage } from '../config/cloudinary';

const router = Router();

// All routes require EMPLOYER auth
router.use(authenticate, authorize('EMPLOYER'));

// GET /api/v1/employers/dashboard
router.get('/dashboard', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const data = await analyticsService.getEmployerDashboard(req.user!.id);
    res.json({ success: true, data });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/employers/profile
router.get('/profile', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const profile = await prisma.employerProfile.findUnique({
      where: { user_id: req.user!.id },
    });
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/employers/profile
router.put('/profile', uploadImage.single('logo'), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const logoUrl = (req.file as any)?.secure_url || req.body.logo_url;
    const updateData = { ...req.body };
    if (logoUrl) updateData.logo_url = logoUrl;

    const profile = await prisma.employerProfile.upsert({
      where: { user_id: req.user!.id },
      update: updateData,
      create: { user_id: req.user!.id, ...updateData },
    });
    res.json({ success: true, data: profile });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/employers/jobs
router.get('/jobs', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { employerProfile: true },
    });
    if (!user?.employerProfile) {
      res.status(400).json({ success: false, error: 'Complete your profile first' });
      return;
    }
    const result = await jobService.getEmployerJobs(user.employerProfile.id, req.query);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/employers/jobs
router.post('/jobs', validateJobPost, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const job = await jobService.createJob(req.user!.id, req.body, false);
    res.status(201).json({ success: true, message: 'Job submitted for review', data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// PUT /api/v1/employers/jobs/:id
router.put('/jobs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { employerProfile: true },
    });
    const job = await jobService.updateJob(req.params.id, user!.employerProfile!.id, req.body);
    res.json({ success: true, data: job });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// DELETE /api/v1/employers/jobs/:id
router.delete('/jobs/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { employerProfile: true },
    });
    await jobService.deleteJob(req.params.id, user!.employerProfile!.id, false);
    res.json({ success: true, message: 'Job deleted' });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/employers/jobs/:id/applications
router.get('/jobs/:id/applications', validatePagination, async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('Fetching applications for job:', req.params.id, 'User:', req.user?.id);
    
    const result = await applicationService.getJobApplications(
      req.params.id, 
      req.user!.id, 
      req.query
    );
    
    console.log('Found applications:', result.applications.length);
    
    res.json({ 
      success: true, 
      applications: result.applications,
      pagination: result.pagination 
    });
  } catch (error: any) {
    console.error('Error fetching applications:', error);
    res.status(error.statusCode || 500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// PUT /api/v1/employers/applications/:id/status
router.put('/applications/:id/status', validateUpdateApplicationStatus, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status, notes } = req.body;
    const result = await applicationService.updateApplicationStatus(req.params.id, req.user!.id, status, notes);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/employers/applications/:id/interview
router.post('/applications/:id/interview', validateInterviewSchedule, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await applicationService.scheduleInterview(req.params.id, req.user!.id, req.body);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// GET /api/v1/employers/subscription
router.get('/subscription', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const subscription = await prisma.subscription.findFirst({
      where: { employer_id: req.user!.id, status: 'ACTIVE' },
    });
    res.json({ success: true, data: subscription });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/employers/subscription/upgrade
router.post('/subscription/upgrade', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { plan } = req.body;
    const result = await paymentService.createStripeCheckout(req.user!.id, plan);
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

// POST /api/v1/employers/subscription/cancel
router.post('/subscription/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await paymentService.cancelSubscription(req.user!.id);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(error.statusCode || 500).json({ success: false, error: error.message });
  }
});

export default router;
