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
  'title', 'description', 'requirements', 'responsibilities', 'benefits',
  'employment_type', 'location_type', 'location', 'country',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period',
  'industry', 'category', 'tags',
  'application_method', 'external_url',
  'visibility',
  'expires_at', 'featured_until',
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

    // Strip unknown fields before any further processing.
    const jobData = sanitizeJobData(rawJobData);

    if (!isAdmin) {
      if (!user.employerProfile) {
        throw new Error('Please complete your employer profile first');
      }

      const subscription = user.subscription[0];
      const planType = subscription?.plan_type || 'FREE';
      const limits = getPlanLimits(planType);

      // Count jobs posted this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyJobs = await prisma.job.count({
        where: {
          employer_id: user.employerProfile.id,
          created_at: { gte: startOfMonth },
          status: { notIn: ['DRAFT', 'REJECTED'] },
        },
      });

      if (monthlyJobs >= limits.jobs) {
        throw Object.assign(
          new Error('Monthly job posting limit reached. Please upgrade your plan.'),
          { statusCode: 403 }
        );
      }

      if (jobData.visibility === 'FEATURED') {
        const featuredUsed = subscription?.featured_jobs_used || 0;
        if (featuredUsed >= limits.featured) {
          throw Object.assign(
            new Error('Featured job limit reached for your plan.'),
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
      jobData.expires_at = jobData.expires_at ?? new Date(Date.now() + limits.duration * 24 * 60 * 60 * 1000);
      jobData.status = 'PENDING_APPROVAL';
    } else {
      jobData.posted_by_admin = true;
      jobData.admin_id = userId;
      jobData.status = 'ACTIVE';
      jobData.published_at = new Date();
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
      where: { id: jobId, employer_id: employerProfileId },
    });
    if (!job) throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });

    const updateData = sanitizeJobData(rawUpdateData);

    // Reset to pending review whenever an active job is edited.
    if (job.status === 'ACTIVE') {
      updateData.status = 'PENDING_APPROVAL';
    }

    return prisma.job.update({ where: { id: jobId }, data: updateData as any });
  }

  async deleteJob(jobId: string, employerProfileId: string, isAdmin = false) {
    const where: any = { id: jobId };
    if (!isAdmin) where.employer_id = employerProfileId;

    const job = await prisma.job.findFirst({ where });
    if (!job) throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });

    return prisma.job.delete({ where: { id: jobId } });
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