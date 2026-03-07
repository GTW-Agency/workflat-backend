import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { notificationService } from './notificationService';
import { JobStatus, Visibility } from '@prisma/client';  // Changed from JobVisibility to Visibility

const PLAN_LIMITS = {
  FREE:     { jobs: 1,        featured: 0, durationDays: 30 },
  STANDARD: { jobs: 5,        featured: 1, durationDays: 60 },
  PREMIUM:  { jobs: Infinity, featured: 3, durationDays: 90 },
};

export class JobService {
  // ─── Create Job ─────────────────────────────────────────
  async createJob(userId: string, jobData: any, isAdmin = false) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        employerProfile: true,
        subscription: { where: { status: 'ACTIVE' } },
      },
    });

    if (!user) throw new AppError('User not found', 404);

    if (!isAdmin && user.role !== 'EMPLOYER') {
      throw new AppError('Only employers can post jobs', 403);
    }

    if (!isAdmin) {
      const subscription = user.subscription[0];
      const planType = (subscription?.plan_type || 'FREE') as keyof typeof PLAN_LIMITS;
      const limits = PLAN_LIMITS[planType];

      // Count jobs posted this month
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const monthlyJobCount = await prisma.job.count({
        where: {
          employer_id: user.employerProfile?.id,
          created_at: { gte: startOfMonth },
          status: { not: 'REJECTED' },
        },
      });

      if (monthlyJobCount >= limits.jobs) {
        throw new AppError(`Monthly job posting limit (${limits.jobs}) reached. Please upgrade your plan.`, 403);
      }

      if (jobData.visibility === 'FEATURED') {
        if (limits.featured === 0) {
          throw new AppError('Featured jobs require a paid plan.', 403);
        }
        if (subscription && subscription.featured_jobs_used >= limits.featured) {
          throw new AppError('Monthly featured job limit reached.', 403);
        }
        // Increment featured usage
        if (subscription) {
          await prisma.subscription.update({
            where: { id: subscription.id },
            data: { featured_jobs_used: { increment: 1 } },
          });
        }
      }

      jobData.employer_id = user.employerProfile?.id;
      jobData.expires_at = new Date(Date.now() + limits.durationDays * 86400000);
      jobData.status = 'PENDING_APPROVAL';
    } else {
      jobData.posted_by_admin = true;
      jobData.admin_id = userId;
      jobData.status = 'ACTIVE';
      jobData.published_at = new Date();
    }

    return prisma.job.create({ data: jobData });
  }

  // ─── Approve / Reject ───────────────────────────────────
  async reviewJob(
    adminId: string,
    jobId: string,
    approved: boolean,
    rejectionReason?: string
  ) {
    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job) throw new AppError('Job not found', 404);

    if (job.status !== 'PENDING_APPROVAL') {
      throw new AppError('Job is not pending approval', 400);
    }

    const updateData = approved
      ? { status: 'ACTIVE' as JobStatus, published_at: new Date(), approved_by: adminId }
      : { status: 'REJECTED' as JobStatus, rejection_reason: rejectionReason, reviewed_by: adminId };

    const updated = await prisma.job.update({ where: { id: jobId }, data: updateData });

    // Get employer's user ID via the profile relation
    const employerProfile = job.employer_id
      ? await prisma.employerProfile.findUnique({ where: { id: job.employer_id } })
      : null;

    if (employerProfile) {
      await notificationService.send(employerProfile.user_id, {
        type: 'JOB_STATUS_UPDATE',
        title: approved ? 'Job Approved' : 'Job Rejected',
        message: approved
          ? `Your job "${job.title}" is now live!`
          : `Your job "${job.title}" was rejected. Reason: ${rejectionReason || 'No reason provided.'}`,
      });
    }

    return updated;
  }

  // ─── Search Jobs ────────────────────────────────────────
  async searchJobs(filters: {
    query?: string;
    location?: string;
    category?: string;
    employment_type?: string;
    salary_min?: number;
    salary_max?: number;
    remote_only?: boolean;
    visa_sponsorship?: boolean;
    page?: number;
    limit?: number;
  }) {
    const { query, location, category, employment_type, salary_min, salary_max, remote_only, page = 1, limit = 20 } = filters;

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

    if (location) where.location = { contains: location, mode: 'insensitive' };
    if (category) where.category = category;
    if (employment_type) where.employment_type = employment_type;
    if (salary_min) where.salary_max = { gte: salary_min };
    if (salary_max) where.salary_min = { lte: salary_max };
    if (remote_only) where.location_type = 'REMOTE';

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        include: {
          employer: {
            select: { company_name: true, logo_url: true, verification_status: true },
          },
        },
        orderBy: [{ visibility: 'desc' }, { created_at: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.job.count({ where }),
    ]);

    return { jobs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  // ─── Get Featured Jobs ──────────────────────────────────
  async getFeaturedJobs(limit = 6) {
    return prisma.job.findMany({
      where: {
        status: 'ACTIVE',
        visibility: 'FEATURED' as Visibility,  // Changed from JobVisibility to Visibility
        featured_until: { gt: new Date() },
      },
      include: {
        employer: { select: { company_name: true, logo_url: true } },
      },
      orderBy: { featured_until: 'desc' },
      take: limit,
    });
  }
}