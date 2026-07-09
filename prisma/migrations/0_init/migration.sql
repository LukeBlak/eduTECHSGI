-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'volunteer', 'committee_leader', 'president', 'vice_president');

-- CreateEnum
CREATE TYPE "HourType" AS ENUM ('admin', 'field');

-- CreateEnum
CREATE TYPE "ActivityStatus" AS ENUM ('active', 'completed');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "HourRequestStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ClassRole" AS ENUM ('instructor', 'assistant');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('registered', 'waitlist', 'cancelled');

-- CreateEnum
CREATE TYPE "AchievementTier" AS ENUM ('bronze', 'silver', 'gold', 'platinum');

-- CreateEnum
CREATE TYPE "AutoCriteriaType" AS ENUM ('none', 'hours_total', 'field_hours', 'admin_hours', 'activities_count', 'classes_count', 'social_records', 'first_activity', 'hours_milestone_50', 'hours_milestone_100');

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "career" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'volunteer',
    "committeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL DEFAULT '',
    "link" TEXT NOT NULL DEFAULT '',
    "read" BOOLEAN NOT NULL DEFAULT false,
    "emailed" BOOLEAN NOT NULL DEFAULT false,
    "metadata" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Committee" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'emerald',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Committee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "objectives" TEXT NOT NULL DEFAULT '',
    "impact" TEXT NOT NULL DEFAULT '',
    "type" TEXT NOT NULL DEFAULT 'EduTECH ESEN',
    "startDate" TEXT NOT NULL DEFAULT '',
    "endDate" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourType" "HourType" NOT NULL DEFAULT 'field',
    "capacity" INTEGER,
    "status" "ActivityStatus" NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "beneficiariesMen" INTEGER NOT NULL DEFAULT 0,
    "beneficiariesWomen" INTEGER NOT NULL DEFAULT 0,
    "ods" TEXT NOT NULL DEFAULT '',
    "committeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ActivityVolunteer" (
    "id" TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'registered',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityVolunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SocialHour" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "activityId" TEXT,
    "hours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "type" "HourType" NOT NULL DEFAULT 'field',
    "date" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'approved',
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HourRequest" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "activityId" TEXT,
    "currentHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "requestedHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedHours" DOUBLE PRECISION,
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "HourRequestStatus" NOT NULL DEFAULT 'pending',
    "reviewerId" TEXT,
    "reviewNotes" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HourRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Class" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "durationHours" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "school" TEXT NOT NULL DEFAULT '',
    "topic" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ActivityStatus" NOT NULL DEFAULT 'active',
    "completedAt" TIMESTAMP(3),
    "committeeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Class_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassVolunteer" (
    "id" TEXT NOT NULL,
    "classId" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "role" "ClassRole" NOT NULL DEFAULT 'instructor',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClassVolunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Income" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'general',
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL DEFAULT '',
    "concept" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "category" TEXT NOT NULL DEFAULT 'general',
    "paymentMethod" TEXT NOT NULL DEFAULT 'efectivo',
    "beneficiary" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "activityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Achievement" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT NOT NULL DEFAULT 'Trophy',
    "color" TEXT NOT NULL DEFAULT 'emerald',
    "tier" "AchievementTier" NOT NULL DEFAULT 'bronze',
    "points" INTEGER NOT NULL DEFAULT 0,
    "auto" BOOLEAN NOT NULL DEFAULT false,
    "autoType" "AutoCriteriaType" NOT NULL DEFAULT 'none',
    "autoThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "repeatable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Achievement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerAchievement" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "achievementId" TEXT NOT NULL,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "grantedById" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerAchievement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_studentId_key" ON "Volunteer"("studentId");

-- CreateIndex
CREATE INDEX "Volunteer_committeeId_idx" ON "Volunteer"("committeeId");

-- CreateIndex
CREATE INDEX "Volunteer_role_idx" ON "Volunteer"("role");

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");

-- CreateIndex
CREATE INDEX "Notification_read_idx" ON "Notification"("read");

-- CreateIndex
CREATE INDEX "Notification_type_idx" ON "Notification"("type");

-- CreateIndex
CREATE UNIQUE INDEX "Committee_name_key" ON "Committee"("name");

-- CreateIndex
CREATE INDEX "Activity_committeeId_idx" ON "Activity"("committeeId");

-- CreateIndex
CREATE INDEX "Activity_status_idx" ON "Activity"("status");

-- CreateIndex
CREATE INDEX "ActivityVolunteer_volunteerId_idx" ON "ActivityVolunteer"("volunteerId");

-- CreateIndex
CREATE INDEX "ActivityVolunteer_status_idx" ON "ActivityVolunteer"("status");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityVolunteer_activityId_volunteerId_key" ON "ActivityVolunteer"("activityId", "volunteerId");

-- CreateIndex
CREATE INDEX "SocialHour_volunteerId_idx" ON "SocialHour"("volunteerId");

-- CreateIndex
CREATE INDEX "SocialHour_activityId_idx" ON "SocialHour"("activityId");

-- CreateIndex
CREATE INDEX "SocialHour_approvalStatus_idx" ON "SocialHour"("approvalStatus");

-- CreateIndex
CREATE INDEX "HourRequest_volunteerId_idx" ON "HourRequest"("volunteerId");

-- CreateIndex
CREATE INDEX "HourRequest_status_idx" ON "HourRequest"("status");

-- CreateIndex
CREATE INDEX "HourRequest_activityId_idx" ON "HourRequest"("activityId");

-- CreateIndex
CREATE INDEX "Class_committeeId_idx" ON "Class"("committeeId");

-- CreateIndex
CREATE INDEX "Class_status_idx" ON "Class"("status");

-- CreateIndex
CREATE INDEX "ClassVolunteer_volunteerId_idx" ON "ClassVolunteer"("volunteerId");

-- CreateIndex
CREATE UNIQUE INDEX "ClassVolunteer_classId_volunteerId_key" ON "ClassVolunteer"("classId", "volunteerId");

-- CreateIndex
CREATE INDEX "Income_category_idx" ON "Income"("category");

-- CreateIndex
CREATE INDEX "Income_date_idx" ON "Income"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_activityId_idx" ON "Expense"("activityId");

-- CreateIndex
CREATE INDEX "Achievement_active_idx" ON "Achievement"("active");

-- CreateIndex
CREATE INDEX "Achievement_auto_idx" ON "Achievement"("auto");

-- CreateIndex
CREATE INDEX "Achievement_tier_idx" ON "Achievement"("tier");

-- CreateIndex
CREATE INDEX "VolunteerAchievement_volunteerId_idx" ON "VolunteerAchievement"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerAchievement_achievementId_idx" ON "VolunteerAchievement"("achievementId");

-- CreateIndex
CREATE INDEX "VolunteerAchievement_automatic_idx" ON "VolunteerAchievement"("automatic");

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerAchievement_volunteerId_achievementId_key" ON "VolunteerAchievement"("volunteerId", "achievementId");

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVolunteer" ADD CONSTRAINT "ActivityVolunteer_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ActivityVolunteer" ADD CONSTRAINT "ActivityVolunteer_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialHour" ADD CONSTRAINT "SocialHour_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialHour" ADD CONSTRAINT "SocialHour_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialHour" ADD CONSTRAINT "SocialHour_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourRequest" ADD CONSTRAINT "HourRequest_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourRequest" ADD CONSTRAINT "HourRequest_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HourRequest" ADD CONSTRAINT "HourRequest_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Class" ADD CONSTRAINT "Class_committeeId_fkey" FOREIGN KEY ("committeeId") REFERENCES "Committee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassVolunteer" ADD CONSTRAINT "ClassVolunteer_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassVolunteer" ADD CONSTRAINT "ClassVolunteer_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAchievement" ADD CONSTRAINT "VolunteerAchievement_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAchievement" ADD CONSTRAINT "VolunteerAchievement_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerAchievement" ADD CONSTRAINT "VolunteerAchievement_achievementId_fkey" FOREIGN KEY ("achievementId") REFERENCES "Achievement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

npm notice
npm notice New major version of npm available! 11.13.0 -> 12.0.0
npm notice Changelog: https://github.com/npm/cli/releases/tag/v12.0.0
npm notice To update run: npm install -g npm@12.0.0
npm notice
