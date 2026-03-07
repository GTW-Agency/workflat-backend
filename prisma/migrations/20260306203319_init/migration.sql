-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'EMPLOYER', 'APPLICANT');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING');

-- CreateEnum
CREATE TYPE "ExperienceLevel" AS ENUM ('ENTRY', 'MID', 'SENIOR', 'EXECUTIVE');

-- CreateEnum
CREATE TYPE "CompanySize" AS ENUM ('SIZE_1_10', 'SIZE_11_50', 'SIZE_51_200', 'SIZE_201_500', 'SIZE_500_PLUS');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('FREE', 'STANDARD', 'PREMIUM');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmploymentType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'FREELANCE', 'INTERNSHIP');

-- CreateEnum
CREATE TYPE "LocationType" AS ENUM ('ONSITE', 'REMOTE', 'HYBRID');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'EXPIRED', 'CLOSED', 'REJECTED');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('STANDARD', 'FEATURED', 'INTERNAL');

-- CreateEnum
CREATE TYPE "ApplicationMethod" AS ENUM ('WORKFLAT', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'REVIEWING', 'SHORTLISTED', 'INTERVIEW', 'OFFER', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "InterviewType" AS ENUM ('PHONE', 'VIDEO', 'ONSITE');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('JOB_ALERT', 'APPLICATION_UPDATE', 'INTERVIEW_INVITE', 'SUBSCRIPTION_EXPIRING', 'SUBSCRIPTION_ACTIVATED', 'JOB_STATUS_UPDATE', 'MESSAGE');

-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('BLOG', 'FAQ', 'PAGE');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SalaryPeriod" AS ENUM ('YEARLY', 'MONTHLY', 'HOURLY');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'PAYPAL');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'REFUNDED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'APPLICANT',
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING',
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_login" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applicant_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "location" TEXT,
    "bio" TEXT,
    "skills" TEXT[],
    "experience_level" "ExperienceLevel",
    "desired_salary" INTEGER,
    "preferred_locations" TEXT[],
    "visa_status" TEXT,
    "relocation_ready" BOOLEAN NOT NULL DEFAULT false,
    "profile_completion" INTEGER NOT NULL DEFAULT 0,
    "resume_url" TEXT,
    "avatar_url" TEXT,

    CONSTRAINT "applicant_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employer_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_description" TEXT,
    "industry" TEXT,
    "company_size" "CompanySize",
    "website" TEXT,
    "logo_url" TEXT,
    "location" TEXT,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "employer_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "plan_type" "PlanType" NOT NULL DEFAULT 'FREE',
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "jobs_limit" INTEGER NOT NULL DEFAULT 1,
    "jobs_used" INTEGER NOT NULL DEFAULT 0,
    "featured_jobs_limit" INTEGER NOT NULL DEFAULT 0,
    "featured_jobs_used" INTEGER NOT NULL DEFAULT 0,
    "stripe_subscription_id" TEXT,
    "paypal_subscription_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jobs" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT,
    "posted_by_admin" BOOLEAN NOT NULL DEFAULT false,
    "admin_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "responsibilities" TEXT,
    "benefits" TEXT,
    "employment_type" "EmploymentType" NOT NULL,
    "location_type" "LocationType" NOT NULL DEFAULT 'ONSITE',
    "location" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'US',
    "salary_min" INTEGER,
    "salary_max" INTEGER,
    "salary_currency" TEXT NOT NULL DEFAULT 'USD',
    "salary_period" "SalaryPeriod" NOT NULL DEFAULT 'YEARLY',
    "industry" TEXT,
    "category" TEXT,
    "tags" TEXT[],
    "application_method" "ApplicationMethod" NOT NULL DEFAULT 'WORKFLAT',
    "external_url" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'DRAFT',
    "visibility" "Visibility" NOT NULL DEFAULT 'STANDARD',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "featured_until" TIMESTAMP(3),
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "application_count" INTEGER NOT NULL DEFAULT 0,
    "approved_by" TEXT,
    "reviewed_by" TEXT,
    "rejection_reason" TEXT,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "cover_letter" TEXT,
    "resume_url" TEXT,
    "answers" JSONB,
    "applied_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_updated" TIMESTAMP(3) NOT NULL,
    "employer_notes" TEXT,
    "interview_date" TIMESTAMP(3),
    "interview_type" "InterviewType",
    "interview_link" TEXT,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_jobs" (
    "id" TEXT NOT NULL,
    "applicant_id" TEXT NOT NULL,
    "job_id" TEXT NOT NULL,
    "saved_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content" (
    "id" TEXT NOT NULL,
    "type" "ContentType" NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "excerpt" TEXT,
    "featured_image" TEXT,
    "author_id" TEXT NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "meta_title" TEXT,
    "meta_description" TEXT,

    CONSTRAINT "content_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "employer_id" TEXT NOT NULL,
    "subscription_id" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payment_method" "PaymentMethod" NOT NULL,
    "payment_provider_id" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'PENDING',
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_key" ON "refresh_tokens"("token");

-- CreateIndex
CREATE UNIQUE INDEX "applicant_profiles_user_id_key" ON "applicant_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "employer_profiles_user_id_key" ON "employer_profiles"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "applications_job_id_applicant_id_key" ON "applications"("job_id", "applicant_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_jobs_applicant_id_job_id_key" ON "saved_jobs"("applicant_id", "job_id");

-- CreateIndex
CREATE UNIQUE INDEX "content_slug_key" ON "content"("slug");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applicant_profiles" ADD CONSTRAINT "applicant_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employer_profiles" ADD CONSTRAINT "employer_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jobs" ADD CONSTRAINT "jobs_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "employer_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "applicant_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content" ADD CONSTRAINT "content_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_employer_id_fkey" FOREIGN KEY ("employer_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
