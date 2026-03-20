import { JobStatus, Visibility } from '@prisma/client';
import prisma from '../config/database';
import notificationService from './notification.service';
import { getPlanLimits, paginate, formatPagination } from '../utils/helpers';
import logger from '../config/logger';

// ─── Whitelist ────────────────────────────────────────────────────────────────
// Every writable Job column from the Prisma schema.
// Unknown keys sent by the client (e.g. `visa_sponsorship`) are stripped here
// before they ever reach Prisma, preventing PrismaClientValidationError crashes.
const ALLOWED_JOB_FIELDS = new Set([
  'title',
  'custom_company_name',
  'description',
  'requirements',
  'responsibilities',
  'benefits',
  'employment_type',
  'location_type',
  'location',
  'country',
  'salary_min',
  'salary_max',
  'salary_currency',
  'salary_period',
  'industry',
  'category',
  'tags',
  'application_method',
  'external_url',
  'visibility',
  'expires_at',
  'featured_until',
]);
function sanitizeJobData(raw: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (ALLOWED_JOB_FIELDS.has(key)) clean[key] = value;
  }
  return clean;
}

// ─── Service ──────────────────────────────────────────────────────────────────
export class JobService {
async createJob(userId: string, rawJobData: any, isAdmin = false) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      employerProfile: true,
      subscription: {
        where: { status: 'ACTIVE' },
        orderBy: { created_at: 'desc' },
        take: 1,
      },
    },
  });

  if (!user) throw new Error('User not found');

  if (!isAdmin && user.role !== 'EMPLOYER') {
    throw new Error('Only employers can post jobs');
  }

  const jobData = sanitizeJobData(rawJobData);

  if (!isAdmin) {
    if (!user.employerProfile) {
      throw new Error('Please complete your employer profile first');
    }

    const subscription = user.subscription[0];
    const planType = subscription?.plan_type || 'FREE';
    const limits = getPlanLimits(planType);

    // Check featured job limit
    if (jobData.visibility === 'FEATURED') {
      const featuredUsed = subscription?.featured_jobs_used || 0;
      if (featuredUsed >= limits.featured) {
        throw Object.assign(
          new Error('Featured job limit reached for your plan. Please upgrade.'),
          { statusCode: 403 }
        );
      }
      if (subscription) {
        await prisma.subscription.update({
          where: { id: subscription.id },
          data: { featured_jobs_used: { increment: 1 } },
        });
      }
    }

    jobData.employer_id = user.employerProfile.id;
    
    // Set expiration based on selected duration
    const expiresInDays = rawJobData.expires_in_days || 30;
    jobData.expires_at = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    jobData.status = 'PENDING_APPROVAL';
  } else {
    jobData.posted_by_admin = true;
    jobData.admin_id = userId;
    jobData.status = 'ACTIVE';
    jobData.published_at = new Date();
    
    // If employer_id is provided, assign to that employer
    if (rawJobData.employer_id) {
      const employer = await prisma.employerProfile.findUnique({
        where: { id: rawJobData.employer_id }
      });
      if (employer) {
        jobData.employer_id = rawJobData.employer_id;
      }
    }
    
    // Set expiration based on selected duration
    const expiresInDays = rawJobData.expires_in_days || 30;
    jobData.expires_at = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
  }

  const job = await prisma.job.create({ data: jobData as any });
  logger.info(`Job created: ${job.id} by user: ${userId}`);
  return job;
}



  async approveJob(adminId: string, jobId: string, approved: boolean, rejectionReason?: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { employer: { include: { user: true } } },
    });

    if (!job) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
    if (job.status !== 'PENDING_APPROVAL') {
      throw Object.assign(new Error('Job is not pending approval'), { statusCode: 400 });
    }

    const updateData = approved
      ? { status: 'ACTIVE' as JobStatus, published_at: new Date(), approved_by: adminId }
      : { status: 'REJECTED' as JobStatus, rejection_reason: rejectionReason, reviewed_by: adminId };

    const updatedJob = await prisma.job.update({
      where: { id: jobId },
      data: updateData,
    });

    if (job.employer?.user) {
      await notificationService.send(job.employer.user.id, {
        type: 'JOB_STATUS_UPDATE',
        title: approved ? 'Job Approved!' : 'Job Requires Changes',
        message: approved
          ? `Your job "${job.title}" is now live on Workflat!`
          : `Your job "${job.title}" was not approved. Reason: ${rejectionReason}`,
      });
    }

    return updatedJob;
  }

  async getJobs(filters: any) {
    const {
      query, location, category, employment_type, location_type,
      salary_min, salary_max, page = 1, limit = 20,
    } = filters;

    const where: any = {
      status: 'ACTIVE',
      expires_at: { gt: new Date() },
    };

    if (query) {
      where.OR = [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
        { tags: { hasSome: query.split(' ') } },
      ];
    }

    if (location)       where.location        = { contains: location, mode: 'insensitive' };
    if (category)       where.category        = category;
    if (employment_type) where.employment_type = employment_type;
    if (location_type)  where.location_type   = location_type;
    if (salary_min)     where.salary_max      = { gte: parseInt(salary_min) };
    if (salary_max)     where.salary_min      = { lte: parseInt(salary_max) };

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          employer: {
            select: { company_name: true, logo_url: true, verification_status: true, location: true },
          },
          _count: { select: { applications: true } },
        },
        orderBy: [{ visibility: 'desc' }, { published_at: 'desc' }],
        ...paginate(pageNum, limitNum),
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, pagination: formatPagination(pageNum, limitNum, total) };
  }

  async getJobById(jobId: string, userId?: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: {
        employer: {
          select: {
            company_name: true, company_description: true, logo_url: true,
            website: true, verification_status: true, location: true,
            industry: true, company_size: true,
          },
        },
        _count: { select: { applications: true } },
      },
    });

    if (!job) throw Object.assign(new Error('Job not found'), { statusCode: 404 });

    // Increment view count (fire-and-forget — don't block the response)
    prisma.job.update({ where: { id: jobId }, data: { view_count: { increment: 1 } } })
      .catch(() => {/* non-critical */});

    let hasApplied = false;
    let isSaved    = false;

    if (userId) {
      // Re-use profile attached by auth middleware if available, otherwise look up.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { applicantProfile: true },
      });
      if (user?.applicantProfile) {
        const [application, savedJob] = await Promise.all([
          prisma.application.findFirst({
            where: { job_id: jobId, applicant_id: user.applicantProfile.id },
            select: { id: true },
          }),
          prisma.savedJob.findFirst({
            where: { job_id: jobId, applicant_id: user.applicantProfile.id },
            select: { id: true },
          }),
        ]);
        hasApplied = !!application;
        isSaved    = !!savedJob;
      }
    }

    return { ...job, hasApplied, isSaved };
  }

  async getFeaturedJobs(limit = 6) {
    return prisma.job.findMany({
      where: {
        status: 'ACTIVE',
        visibility: 'FEATURED' as Visibility,
        featured_until: { gt: new Date() },
      },
      include: {
        employer: { select: { company_name: true, logo_url: true, location: true } },
      },
      orderBy: { featured_until: 'desc' },
      take: limit,
    });
  }

  async getEmployerJobs(employerId: string, filters: any = {}) {
    const { status, page = 1, limit = 10 } = filters;
    const where: any = { employer_id: employerId };
    if (status) where.status = status;

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: { _count: { select: { applications: true } } },
        orderBy: { created_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, pagination: formatPagination(pageNum, limitNum, total) };
  }

  async updateJob(jobId: string, employerProfileId: string, rawUpdateData: any) {
  const job = await prisma.job.findFirst({
    where: { 
      id: jobId, 
      employer_id: employerProfileId 
    },
  });
  
  if (!job) throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });

  // Don't allow editing if job is already approved and active?
  // You can decide based on business logic
  if (job.status === 'ACTIVE') {
    // Option 1: Set back to pending approval for review
    rawUpdateData.status = 'PENDING_APPROVAL';
  }

  const updateData = sanitizeJobData(rawUpdateData);

  return prisma.job.update({ 
    where: { id: jobId }, 
    data: updateData as any 
  });
}

  async deleteJob(jobId: string, employerProfileId: string, isAdmin = false) {
    const where: any = { id: jobId };
    if (!isAdmin) where.employer_id = employerProfileId;

    const job = await prisma.job.findFirst({ where });
    if (!job) throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });

    return prisma.job.delete({ where: { id: jobId } });
  }
  // Add this method to your JobService class

async rejectJob(adminId: string, jobId: string, reason: string) {
  const job = await prisma.job.findUnique({
    where: { id: jobId },
    include: { employer: { include: { user: true } } },
  });

  if (!job) throw Object.assign(new Error('Job not found'), { statusCode: 404 });
  if (job.status !== 'PENDING_APPROVAL') {
    throw Object.assign(new Error('Job is not pending approval'), { statusCode: 400 });
  }

  const updatedJob = await prisma.job.update({
    where: { id: jobId },
    data: { 
      status: 'REJECTED', 
      rejection_reason: reason, 
      reviewed_by: adminId 
    },
  });

  if (job.employer?.user) {
    // Send notification to employer
    await prisma.notification.create({
      data: {
        user_id: job.employer.user.id,
        type: 'JOB_STATUS_UPDATE',
        title: 'Job Rejected',
        message: `Your job "${job.title}" was rejected. Reason: ${reason}`,
        data: { jobId, reason }
      }
    });
  }

  return updatedJob;
}

  async getAdminJobs(filters: any = {}) {
    const { status, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (status) where.status = status;

    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          employer: { select: { company_name: true, verification_status: true } },
          _count: { select: { applications: true } },
        },
        orderBy: { created_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, pagination: formatPagination(pageNum, limitNum, total) };
  }
}

export const jobService = new JobService();
export default jobService;