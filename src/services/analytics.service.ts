import prisma from '../config/database';
import { paginate, formatPagination } from '../utils/helpers';

export class AnalyticsService {
  async getAdminDashboard() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      totalJobs,
      totalApplications,
      activeSubscriptions,
      revenueResult,
      pendingJobs,
      recentSignups,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.job.count(),
      prisma.application.count(),
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      prisma.transaction.aggregate({
        where: {
          created_at: { gte: thirtyDaysAgo },
          status: 'COMPLETED',
        },
        _sum: { amount: true },
      }),
      prisma.job.count({ where: { status: 'PENDING_APPROVAL' } }),
      prisma.user.findMany({
        where: { created_at: { gte: sevenDaysAgo } },
        select: { id: true, email: true, role: true, created_at: true, status: true },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);

    const jobsByStatus = await prisma.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });

    const usersByRole = await prisma.user.groupBy({
      by: ['role'],
      _count: { _all: true },
    });

    const popularJobs = await prisma.job.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        title: true,
        view_count: true,
        application_count: true,
        employer: { select: { company_name: true } },
      },
      orderBy: { application_count: 'desc' },
      take: 5,
    });

    return {
      overview: {
        totalUsers,
        totalJobs,
        totalApplications,
        activeSubscriptions,
        revenueThisMonth: revenueResult._sum.amount || 0,
        pendingJobApprovals: pendingJobs,
      },
      charts: {
        jobsByStatus: jobsByStatus.map((s) => ({ status: s.status, count: s._count._all })),
        usersByRole: usersByRole.map((r) => ({ role: r.role, count: r._count._all })),
      },
      recentSignups,
      popularJobs,
    };
  }

  async getEmployerDashboard(employerUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: employerUserId },
      include: { employerProfile: true, subscription: { where: { status: 'ACTIVE' }, take: 1 } },
    });

    if (!user?.employerProfile) {
      return { jobs: [], totalViews: 0, totalApplications: 0 };
    }

    const jobs = await prisma.job.findMany({
      where: { employer_id: user.employerProfile.id },
      include: { _count: { select: { applications: true } } },
      orderBy: { created_at: 'desc' },
    });

    const totalViews = jobs.reduce((sum, job) => sum + job.view_count, 0);
    const totalApplications = jobs.reduce((sum, job) => sum + job._count.applications, 0);

    const recentApplications = await prisma.application.findMany({
      where: { job: { employer_id: user.employerProfile.id } },
      include: {
        job: { select: { title: true } },
        applicant: { select: { first_name: true, last_name: true, avatar_url: true } },
      },
      orderBy: { applied_at: 'desc' },
      take: 5,
    });

    const subscription = user.subscription[0];

    return {
      overview: {
        activeJobs: jobs.filter((j) => j.status === 'ACTIVE').length,
        pendingJobs: jobs.filter((j) => j.status === 'PENDING_APPROVAL').length,
        totalJobs: jobs.length,
        totalViews,
        totalApplications,
      },
      subscription: subscription
        ? {
            plan: subscription.plan_type,
            jobsUsed: subscription.jobs_used,
            jobsLimit: subscription.jobs_limit,
            featuredUsed: subscription.featured_jobs_used,
            featuredLimit: subscription.featured_jobs_limit,
            expiresAt: subscription.end_date,
          }
        : null,
      jobsPerformance: jobs.map((j) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        views: j.view_count,
        applications: j._count.applications,
        createdAt: j.created_at,
      })),
      recentApplications,
    };
  }

  async getApplicantDashboard(applicantUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: applicantUserId },
      include: { applicantProfile: true },
    });

    if (!user?.applicantProfile) {
      return { applications: [], savedJobs: [], profileCompletion: 0 };
    }

    const [applicationStats, savedJobsCount, recentApplications] = await Promise.all([
      prisma.application.groupBy({
        by: ['status'],
        where: { applicant_id: user.applicantProfile.id },
        _count: { _all: true },
      }),
      prisma.savedJob.count({ where: { applicant_id: user.applicantProfile.id } }),
      prisma.application.findMany({
        where: { applicant_id: user.applicantProfile.id },
        include: {
          job: {
            include: { employer: { select: { company_name: true, logo_url: true } } },
          },
        },
        orderBy: { applied_at: 'desc' },
        take: 5,
      }),
    ]);

    return {
      overview: {
        totalApplications: applicationStats.reduce((s, a) => s + a._count._all, 0),
        savedJobs: savedJobsCount,
        profileCompletion: user.applicantProfile.profile_completion,
        applicationsByStatus: applicationStats.map((s) => ({
          status: s.status,
          count: s._count._all,
        })),
      },
      recentApplications,
    };
  }

  async getAdminUsers(filters: any = {}) {
    const { role, status, search, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.email = { contains: search, mode: 'insensitive' };
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          role: true,
          status: true,
          email_verified: true,
          created_at: true,
          last_login: true,
          applicantProfile: { select: { first_name: true, last_name: true } },
          employerProfile: { select: { company_name: true, verification_status: true } },
        },
        orderBy: { created_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.user.count({ where }),
    ]);

    return { users, pagination: formatPagination(pageNum, limitNum, total) };
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;
