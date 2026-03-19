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
        select: { 
          id: true, 
          email: true, 
          role: true, 
          created_at: true, 
          status: true,
          applicantProfile: {
            select: {
              first_name: true,
              last_name: true,
              avatar_url: true
            }
          },
          employerProfile: {
            select: {
              company_name: true,
              logo_url: true
            }
          }
        },
        orderBy: { created_at: 'desc' },
        take: 10,
      }),
    ]);

    const jobsByStatus = await prisma.job.groupBy({
      by: ['status'],
      _count: { _all: true },
    });
    
    const formattedJobsByStatus = jobsByStatus.map((s: any) => ({ 
      status: s.status, 
      _count: s._count._all 
    }));

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
      stats: {
        total_users: totalUsers,
        total_jobs: totalJobs,
        total_applications: totalApplications,
        active_subscriptions: activeSubscriptions,
        monthly_revenue: revenueResult._sum.amount || 0,
        pending_jobs: pendingJobs,
      },
      usersByRole: usersByRole.map((r: any) => ({ 
        role: r.role, 
        _count: r._count._all 
      })),
      jobsByStatus: formattedJobsByStatus,
      recentSignups,
      popularJobs,
    };
  }

  async getAdminUsers(filters: any = {}) {
    const { role, status, search, page = 1, limit = 20 } = filters;
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (search) {
      where.OR = [
        { email: { contains: search, mode: 'insensitive' } },
        { applicantProfile: { first_name: { contains: search, mode: 'insensitive' } } },
        { applicantProfile: { last_name: { contains: search, mode: 'insensitive' } } },
        { employerProfile: { company_name: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);

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
          applicantProfile: { 
            select: { 
              first_name: true, 
              last_name: true,
              phone: true,
              location: true,
              title: true,
              bio: true,
              skills: true,
              years_experience: true,
              education: true,
              resume_url: true,
              linkedin_url: true,
              portfolio_url: true,
              avatar_url: true,
              nationality: true,
              experience_level: true,
              desired_salary: true,
              preferred_locations: true,
              visa_status: true,
              relocation_ready: true,
              profile_completion: true,
            } 
          },
          employerProfile: { 
            select: { 
              company_name: true, 
              industry: true,
              location: true,
              website: true,
              verification_status: true,
              logo_url: true,
            } 
          },
        },
        orderBy: { created_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.user.count({ where }),
    ]);

    return { 
      users, 
      pagination: formatPagination(pageNum, limitNum, total) 
    };
  }

  async getEmployerDashboard(employerUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: employerUserId },
      include: { 
        employerProfile: true, 
        subscription: { 
          where: { status: 'ACTIVE' }, 
          take: 1 
        } 
      },
    });

    if (!user?.employerProfile) {
      return { jobs: [], totalViews: 0, totalApplications: 0 };
    }

    const jobs = await prisma.job.findMany({
      where: { employer_id: user.employerProfile.id },
      include: { _count: { select: { applications: true } } },
      orderBy: { created_at: 'desc' },
    });

    const totalViews = jobs.reduce((sum: number, job: any) => sum + (job.view_count || 0), 0);
    const totalApplications = jobs.reduce((sum: number, job: any) => sum + job._count.applications, 0);

    const recentApplications = await prisma.application.findMany({
      where: { job: { employer_id: user.employerProfile.id } },
      include: {
        job: { select: { title: true } },
        applicant: { 
          select: { 
            first_name: true, 
            last_name: true, 
            avatar_url: true,
            title: true
          } 
        },
      },
      orderBy: { applied_at: 'desc' },
      take: 5,
    });

    const subscription = user.subscription[0];

    return {
      stats: {
        active_jobs: jobs.filter((j: any) => j.status === 'ACTIVE').length,
        pending_jobs: jobs.filter((j: any) => j.status === 'PENDING_APPROVAL').length,
        total_jobs: jobs.length,
        total_views: totalViews,
        total_applications: totalApplications,
        pending_applications: 0, // You can calculate this if needed
      },
      subscription: subscription
        ? {
            plan: subscription.plan_type,
            status: subscription.status,
            jobsUsed: subscription.jobs_used,
            jobsLimit: subscription.jobs_limit,
            featuredUsed: subscription.featured_jobs_used,
            featuredLimit: subscription.featured_jobs_limit,
            expiresAt: subscription.end_date,
          }
        : null,
      usageLimits: subscription
        ? {
            jobsUsed: subscription.jobs_used,
            jobsLimit: subscription.jobs_limit,
          }
        : { jobsUsed: 0, jobsLimit: 1 },
      jobsPerformance: jobs.map((j: any) => ({
        id: j.id,
        title: j.title,
        status: j.status,
        views: j.view_count || 0,
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

    const totalApplications = applicationStats.reduce((s: number, a: any) => s + a._count._all, 0);
    const pendingApplications = applicationStats
      .filter((a: any) => ['PENDING', 'REVIEWING'].includes(a.status))
      .reduce((s: number, a: any) => s + a._count._all, 0);
    const interviews = applicationStats
      .filter((a: any) => a.status === 'INTERVIEW')
      .reduce((s: number, a: any) => s + a._count._all, 0);

    return {
      stats: {
        total_applications: totalApplications,
        pending_applications: pendingApplications,
        saved_jobs: savedJobsCount,
        interviews: interviews,
      },
      profileCompletion: user.applicantProfile.profile_completion || 0,
      recentApplications,
    };
  }
}

export const analyticsService = new AnalyticsService();
export default analyticsService;