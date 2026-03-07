/*
  Warnings:

  - You are about to drop the `applicant_profiles` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "applicant_profiles" DROP CONSTRAINT "applicant_profiles_user_id_fkey";

-- DropForeignKey
ALTER TABLE "applications" DROP CONSTRAINT "applications_applicant_id_fkey";

-- DropForeignKey
ALTER TABLE "saved_jobs" DROP CONSTRAINT "saved_jobs_applicant_id_fkey";

-- DropTable
DROP TABLE "applicant_profiles";

-- CreateTable
CREATE TABLE "ApplicantProfile" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone" TEXT,
    "nationality" TEXT,
    "location" TEXT,
    "title" TEXT,
    "bio" TEXT,
    "skills" TEXT[],
    "years_experience" INTEGER,
    "education" TEXT,
    "linkedin_url" TEXT,
    "portfolio_url" TEXT,
    "experience_level" "ExperienceLevel",
    "desired_salary" INTEGER,
    "preferred_locations" TEXT[],
    "visa_status" TEXT,
    "relocation_ready" BOOLEAN NOT NULL DEFAULT false,
    "profile_completion" INTEGER NOT NULL DEFAULT 0,
    "resume_url" TEXT,
    "avatar_url" TEXT,

    CONSTRAINT "ApplicantProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ApplicantProfile_user_id_key" ON "ApplicantProfile"("user_id");

-- AddForeignKey
ALTER TABLE "ApplicantProfile" ADD CONSTRAINT "ApplicantProfile_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "ApplicantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_jobs" ADD CONSTRAINT "saved_jobs_applicant_id_fkey" FOREIGN KEY ("applicant_id") REFERENCES "ApplicantProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
