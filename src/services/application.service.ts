import prisma from '../config/database';
import notificationService from './notification.service';
import { paginate, formatPagination } from '../utils/helpers';
import { sendEmail, emailTemplates } from '../config/email';
import logger from '../config/logger';

export class ApplicationService {
  async apply(applicantUserId: string, jobId: string, data: any) {
    try {
      // Get user with applicant profile
      const user = await prisma.user.findUnique({
        where: { id: applicantUserId },
        include: { 
          applicantProfile: true 
        },
      });

      if (!user?.applicantProfile) {
        throw Object.assign(new Error('Complete your applicant profile first'), { statusCode: 400 });
      }

      // Get job details with employer
      const job = await prisma.job.findUnique({ 
        where: { id: jobId },
        include: { 
          employer: { 
            include: { 
              user: true 
            } 
          } 
        }
      });
      
      if (!job || job.status !== 'ACTIVE') {
        throw Object.assign(new Error('Job is not available'), { statusCode: 400 });
      }
      if (job.expires_at && job.expires_at < new Date()) {
        throw Object.assign(new Error('This job has expired'), { statusCode: 400 });
      }

      // Check existing application
      const existing = await prisma.application.findUnique({
        where: { 
          job_id_applicant_id: { 
            job_id: jobId, 
            applicant_id: user.applicantProfile.id 
          } 
        },
      });
      
      if (existing) {
        throw Object.assign(new Error('You have already applied to this job'), { statusCode: 409 });
      }

      // Create application
      const application = await prisma.application.create({
        data: {
          job_id: jobId,
          applicant_id: user.applicantProfile.id,
          cover_letter: data.cover_letter,
          resume_url: data.resume_url || user.applicantProfile.resume_url,
          answers: data.answers,
          status: 'PENDING',
        },
        include: { 
          job: { 
            include: { 
              employer: { 
                include: { 
                  user: true 
                } 
              } 
            } 
          },
          applicant: {
            include: {
              user: true
            }
          }
        },
      });

      // Increment job application count
      await prisma.job.update({
        where: { id: jobId },
        data: { application_count: { increment: 1 } },
      });

      // Send notification to employer
      if (application.job.employer?.user) {
        logger.info(`Sending notification to employer: ${application.job.employer.user.id}`);
        
        await notificationService.send(application.job.employer.user.id, {
          type: 'APPLICATION_UPDATE',
          title: 'New Application Received',
          message: `A new applicant has applied for "${application.job.title}"`,
          data: {
            jobId: jobId,
            jobTitle: application.job.title,
            applicantName: `${user.applicantProfile.first_name} ${user.applicantProfile.last_name}`,
            appliedAt: new Date().toISOString(),
          },
        });

        // Send email to employer
        try {
          await sendEmail({
            to: application.job.employer.user.email,
            subject: `New Application: ${application.job.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #2563eb;">New Application Received</h2>
                <p><strong>Job:</strong> ${application.job.title}</p>
                <p><strong>Applicant:</strong> ${user.applicantProfile.first_name} ${user.applicantProfile.last_name}</p>
                <p><strong>Applied:</strong> ${new Date().toLocaleString()}</p>
                <a href="${process.env.FRONTEND_URL}/employer/jobs/${jobId}/applications" 
                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
                  View Application
                </a>
              </div>
            `,
          });
        } catch (emailError) {
          logger.error('Failed to send employer email:', emailError);
        }
      }

      // Confirm to applicant via email
      await sendEmail({
        to: user.email,
        subject: `Application submitted for ${job.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">Application Submitted!</h2>
            <p>Hi ${user.applicantProfile.first_name},</p>
            <p>Your application for <strong>${job.title}</strong> has been received.</p>
            <a href="${process.env.FRONTEND_URL}/applicant/applications" 
               style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 16px;">
              Track Your Applications
            </a>
          </div>
        `,
      });

      logger.info(`Application created: ${application.id} for job: ${jobId}`);
      return application;
      
    } catch (error: any) {
      logger.error('Application error:', error);
      throw error;
    }
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
    try {
      // Get employer profile
      const user = await prisma.user.findUnique({
        where: { id: employerUserId },
        include: { employerProfile: true },
      });

      if (!user?.employerProfile && user?.role !== 'ADMIN') {
        throw Object.assign(new Error('Employer profile not found'), { statusCode: 404 });
      }

      // Verify job belongs to employer
      const job = await prisma.job.findFirst({
        where: {
          id: jobId,
          ...(user?.role !== 'ADMIN' && { employer_id: user?.employerProfile?.id }),
        },
      });

      if (!job) {
        throw Object.assign(new Error('Job not found or unauthorized'), { statusCode: 404 });
      }

      const { status, page = 1, limit = 20 } = filters;
      const where: any = { job_id: jobId };
      if (status) where.status = status;

      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      // Get applications with full applicant details
      const [applications, total] = await Promise.all([
        prisma.application.findMany({
          where,
          include: {
            applicant: {
              include: {
                user: { 
                  select: { 
                    id: true,
                    email: true, 
                    created_at: true,
                    status: true,
                  } 
                },
              },
            },
            job: {
              select: {
                id: true,
                title: true,
                custom_company_name: true,
                location: true,
              }
            }
          },
          orderBy: { applied_at: 'desc' },
          skip: (pageNum - 1) * limitNum,
          take: limitNum,
        }),
        prisma.application.count({ where }),
      ]);

      // Format the response to ensure all fields are present
      const formattedApplications = applications.map(app => ({
        id: app.id,
        status: app.status,
        applied_at: app.applied_at,
        cover_letter: app.cover_letter,
        employer_notes: app.employer_notes,
        interview_date: app.interview_date,
        interview_type: app.interview_type,
        interview_link: app.interview_link,
        job: app.job,
        applicant: {
          id: app.applicant.id,
          first_name: app.applicant.first_name || '',
          last_name: app.applicant.last_name || '',
          email: app.applicant.user?.email || '',
          phone: app.applicant.phone || '',
          location: app.applicant.location || '',
          title: app.applicant.title || '',
          bio: app.applicant.bio || '',
          skills: app.applicant.skills || [],
          years_experience: app.applicant.years_experience,
          education: app.applicant.education || '',
          resume_url: app.applicant.resume_url,
          linkedin_url: app.applicant.linkedin_url,
          portfolio_url: app.applicant.portfolio_url,
          avatar_url: app.applicant.avatar_url,
          nationality: app.applicant.nationality,
          experience_level: app.applicant.experience_level,
          desired_salary: app.applicant.desired_salary,
          preferred_locations: app.applicant.preferred_locations || [],
          visa_status: app.applicant.visa_status,
          relocation_ready: app.applicant.relocation_ready,
          profile_completion: app.applicant.profile_completion,
        }
      }));

      logger.info(`Retrieved ${formattedApplications.length} applications for job: ${jobId}`);

      return { 
        applications: formattedApplications, 
        pagination: formatPagination(pageNum, limitNum, total) 
      };
      
    } catch (error: any) {
      logger.error('Error getting job applications:', error);
      throw error;
    }
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
