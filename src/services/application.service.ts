import prisma from '../config/database';
import notificationService from './notification.service';
import { paginate, formatPagination } from '../utils/helpers';
import { sendEmail, emailTemplates } from '../config/email';

export class ApplicationService {
  async apply(applicantUserId: string, jobId: string, data: any) {
    const user = await prisma.user.findUnique({
      where: { id: applicantUserId },
      include: { applicantProfile: true },
    });

    if (!user?.applicantProfile) {
      throw Object.assign(new Error('Complete your applicant profile first'), { statusCode: 400 });
    }

    const job = await prisma.job.findUnique({ where: { id: jobId } });
    if (!job || job.status !== 'ACTIVE') {
      throw Object.assign(new Error('Job is not available'), { statusCode: 400 });
    }
    if (job.expires_at && job.expires_at < new Date()) {
      throw Object.assign(new Error('This job has expired'), { statusCode: 400 });
    }

    // Check existing application
    const existing = await prisma.application.findUnique({
      where: { job_id_applicant_id: { job_id: jobId, applicant_id: user.applicantProfile.id } },
    });
    if (existing) {
      throw Object.assign(new Error('You have already applied to this job'), { statusCode: 409 });
    }

    const application = await prisma.application.create({
      data: {
        job_id: jobId,
        applicant_id: user.applicantProfile.id,
        cover_letter: data.cover_letter,
        resume_url: data.resume_url || user.applicantProfile.resume_url,
        answers: data.answers,
      },
      include: { job: { include: { employer: { include: { user: true } } } } },
    });

    // Increment job application count
    await prisma.job.update({
      where: { id: jobId },
      data: { application_count: { increment: 1 } },
    });

    // Notify employer
    if (application.job.employer?.user) {
      await notificationService.send(application.job.employer.user.id, {
        type: 'APPLICATION_UPDATE',
        title: 'New Application Received',
        message: `A new applicant has applied for "${application.job.title}"`,
      });
    }

    // Confirm to applicant via email
    await sendEmail({
      to: user.email,
      ...emailTemplates.applicationReceived(
        `${user.applicantProfile.first_name}`,
        job.title
      ),
    });

    return application;
  }

  async getApplicantApplications(applicantUserId: string, filters: any = {}) {
    const user = await prisma.user.findUnique({
      where: { id: applicantUserId },
      include: { applicantProfile: true },
    });
    if (!user?.applicantProfile) throw new Error('Profile not found');

    const { status, page = 1, limit = 10 } = filters;
    const where: any = { applicant_id: user.applicantProfile.id };
    if (status) where.status = status;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          job: {
            include: {
              employer: { select: { company_name: true, logo_url: true } },
            },
          },
        },
        orderBy: { applied_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.application.count({ where }),
    ]);

    return { applications, pagination: formatPagination(pageNum, limitNum, total) };
  }

  async getJobApplications(jobId: string, employerUserId: string, filters: any = {}) {
    const user = await prisma.user.findUnique({
      where: { id: employerUserId },
      include: { employerProfile: true },
    });

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        ...(user?.role !== 'ADMIN' && { employer_id: user?.employerProfile?.id }),
      },
    });

    if (!job) throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });

    const { status, page = 1, limit = 20 } = filters;
    const where: any = { job_id: jobId };
    if (status) where.status = status;

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);

    const [applications, total] = await Promise.all([
      prisma.application.findMany({
        where,
        include: {
          applicant: {
            include: {
              user: { select: { email: true, created_at: true } },
            },
          },
        },
        orderBy: { applied_at: 'desc' },
        ...paginate(pageNum, limitNum),
      }),
      prisma.application.count({ where }),
    ]);

    return { applications, pagination: formatPagination(pageNum, limitNum, total) };
  }

  async updateApplicationStatus(
    applicationId: string,
    employerUserId: string,
    status: string,
    notes?: string
  ) {
    const user = await prisma.user.findUnique({
      where: { id: employerUserId },
      include: { employerProfile: true },
    });

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        applicant: { include: { user: true } },
      },
    });

    if (!application) throw Object.assign(new Error('Application not found'), { statusCode: 404 });

    if (
      user?.role !== 'ADMIN' &&
      application.job.employer_id !== user?.employerProfile?.id
    ) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: { status: status as any, employer_notes: notes },
    });

    // Notify applicant
    if (application.applicant.user) {
      await notificationService.send(application.applicant.user.id, {
        type: 'APPLICATION_UPDATE',
        title: 'Application Status Updated',
        message: `Your application for "${application.job.title}" is now: ${status}`,
      });
    }

    return updated;
  }

  async scheduleInterview(applicationId: string, employerUserId: string, interviewData: any) {
    const user = await prisma.user.findUnique({
      where: { id: employerUserId },
      include: { employerProfile: true },
    });

    const application = await prisma.application.findUnique({
      where: { id: applicationId },
      include: {
        job: true,
        applicant: { include: { user: true } },
      },
    });

    if (!application) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    if (
      user?.role !== 'ADMIN' &&
      application.job.employer_id !== user?.employerProfile?.id
    ) {
      throw Object.assign(new Error('Unauthorized'), { statusCode: 403 });
    }

    const updated = await prisma.application.update({
      where: { id: applicationId },
      data: {
        status: 'INTERVIEW',
        interview_date: new Date(interviewData.interview_date),
        interview_type: interviewData.interview_type,
        interview_link: interviewData.interview_link,
      },
    });

    // Notify applicant
    if (application.applicant.user) {
      await notificationService.send(application.applicant.user.id, {
        type: 'INTERVIEW_INVITE',
        title: 'Interview Scheduled!',
        message: `You have an interview for "${application.job.title}" on ${new Date(interviewData.interview_date).toLocaleString()}`,
      });

      await sendEmail({
        to: application.applicant.user.email,
        ...emailTemplates.interviewInvite(
          application.applicant.first_name,
          application.job.title,
          new Date(interviewData.interview_date).toLocaleString(),
          interviewData.interview_type,
          interviewData.interview_link
        ),
      });
    }

    return updated;
  }

  async withdrawApplication(applicationId: string, applicantUserId: string) {
    const user = await prisma.user.findUnique({
      where: { id: applicantUserId },
      include: { applicantProfile: true },
    });

    const application = await prisma.application.findFirst({
      where: { id: applicationId, applicant_id: user?.applicantProfile?.id },
    });

    if (!application) throw Object.assign(new Error('Application not found'), { statusCode: 404 });
    if (['HIRED', 'REJECTED', 'WITHDRAWN'].includes(application.status)) {
      throw Object.assign(new Error('Cannot withdraw this application'), { statusCode: 400 });
    }

    return prisma.application.update({
      where: { id: applicationId },
      data: { status: 'WITHDRAWN' },
    });
  }
}

export const applicationService = new ApplicationService();
export default applicationService;
