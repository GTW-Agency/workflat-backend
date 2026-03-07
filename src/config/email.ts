import nodemailer from 'nodemailer';
import logger from './logger';

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_PORT === '465',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

transporter.verify((error) => {
  if (error) {
    logger.warn('Email service not configured:', error.message);
  } else {
    logger.info('Email service ready');
  }
});

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export const sendEmail = async (options: EmailOptions): Promise<void> => {
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'Workflat <noreply@workflat.com>',
      ...options,
    });
    logger.info(`Email sent to ${options.to}`);
  } catch (error) {
    logger.error('Email send failed:', error);
    throw error;
  }
};

export const emailTemplates = {
  verifyEmail: (name: string, token: string) => ({
    subject: 'Verify your Workflat account',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563eb">Welcome to Workflat!</h2>
        <p>Hi ${name}, please verify your email address.</p>
        <a href="${process.env.FRONTEND_URL}/verify-email?token=${token}"
           style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          Verify Email
        </a>
        <p style="color:#666;font-size:13px">Link expires in 24 hours. If you didn't sign up, ignore this email.</p>
      </div>
    `,
  }),

  resetPassword: (name: string, token: string) => ({
    subject: 'Reset your Workflat password',
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563eb">Password Reset</h2>
        <p>Hi ${name}, click below to reset your password.</p>
        <a href="${process.env.FRONTEND_URL}/reset-password?token=${token}"
           style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          Reset Password
        </a>
        <p style="color:#666;font-size:13px">Link expires in 1 hour. If you didn't request this, ignore this email.</p>
      </div>
    `,
  }),

  jobApproved: (employerName: string, jobTitle: string) => ({
    subject: `Your job "${jobTitle}" is now live!`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#16a34a">Job Approved!</h2>
        <p>Hi ${employerName}, your job posting <strong>${jobTitle}</strong> has been approved and is now live on Workflat.</p>
        <a href="${process.env.FRONTEND_URL}/employer/jobs"
           style="background:#16a34a;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          View Your Jobs
        </a>
      </div>
    `,
  }),

  jobRejected: (employerName: string, jobTitle: string, reason: string) => ({
    subject: `Your job "${jobTitle}" requires changes`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#dc2626">Job Not Approved</h2>
        <p>Hi ${employerName}, your job posting <strong>${jobTitle}</strong> was not approved.</p>
        <p><strong>Reason:</strong> ${reason}</p>
        <a href="${process.env.FRONTEND_URL}/employer/jobs"
           style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          Edit and Resubmit
        </a>
      </div>
    `,
  }),

  applicationReceived: (applicantName: string, jobTitle: string) => ({
    subject: `Application submitted for ${jobTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563eb">Application Submitted!</h2>
        <p>Hi ${applicantName}, your application for <strong>${jobTitle}</strong> has been received.</p>
        <a href="${process.env.FRONTEND_URL}/applicant/applications"
           style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          Track Your Applications
        </a>
      </div>
    `,
  }),

  interviewInvite: (applicantName: string, jobTitle: string, date: string, type: string, link?: string) => ({
    subject: `Interview invitation for ${jobTitle}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
        <h2 style="color:#2563eb">Interview Invitation</h2>
        <p>Hi ${applicantName}, you've been invited to interview for <strong>${jobTitle}</strong>.</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Type:</strong> ${type}</p>
        ${link ? `<p><strong>Link:</strong> <a href="${link}">${link}</a></p>` : ''}
        <a href="${process.env.FRONTEND_URL}/applicant/applications"
           style="background:#2563eb;color:white;padding:12px 24px;text-decoration:none;border-radius:6px;display:inline-block;margin:16px 0">
          View Details
        </a>
      </div>
    `,
  }),
};
