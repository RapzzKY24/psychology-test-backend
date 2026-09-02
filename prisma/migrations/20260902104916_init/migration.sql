-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'PSYCHOLOGIST', 'PARTICIPANT');

-- CreateEnum
CREATE TYPE "ResultStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('UNPAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TestCategory" AS ENUM ('PERSONALITY', 'COGNITIVE', 'WORK_STYLE', 'INTEREST', 'PROJECTIVE');

-- CreateEnum
CREATE TYPE "ScorerType" AS ENUM ('FORCED_CHOICE_DISC');

-- CreateEnum
CREATE TYPE "TestStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SessionKind" AS ENUM ('INDIVIDUAL', 'GROUP');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('ACTIVE', 'CLOSED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryChannel" AS ENUM ('PDF', 'EMAIL');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('SENT', 'FAILED');

-- CreateTable
CREATE TABLE "tests" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "TestCategory" NOT NULL,
    "scorerType" "ScorerType" NOT NULL,
    "price" INTEGER NOT NULL,
    "estimatedDurationMin" INTEGER NOT NULL,
    "status" "TestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_items" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "order" INTEGER NOT NULL,
    "content" JSONB NOT NULL,

    CONSTRAINT "test_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interpretations" (
    "id" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "patternCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,

    CONSTRAINT "interpretations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "institutions" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "institutions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_sessions" (
    "id" UUID NOT NULL,
    "kind" "SessionKind" NOT NULL,
    "institutionId" UUID,
    "createdById" UUID,
    "title" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "pinHash" TEXT,
    "slotLimit" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "psychologist_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "fullName" TEXT NOT NULL,
    "degree" TEXT NOT NULL,
    "licenseNumber" TEXT NOT NULL,
    "signatureImagePath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "psychologist_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_tests" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "session_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_participants" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "candidateNumber" TEXT,
    "tokenHash" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "session_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attempts" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "userId" UUID,
    "participantId" UUID,
    "status" "AttemptStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responses" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "itemId" UUID NOT NULL,
    "value" JSONB NOT NULL,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_results" (
    "id" UUID NOT NULL,
    "attemptId" UUID NOT NULL,
    "scores" JSONB NOT NULL,
    "patternCode" TEXT NOT NULL,
    "correctedScores" JSONB,
    "correctedPatternCode" TEXT,
    "correctionReason" TEXT,
    "correctedById" UUID,
    "correctedAt" TIMESTAMP(3),
    "notes" TEXT,
    "notesUpdatedAt" TIMESTAMP(3),
    "status" "ResultStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "verifyCode" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "test_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "invoices" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "number" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "testId" UUID NOT NULL,
    "basePrice" INTEGER NOT NULL,
    "uniqueCode" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "userClaimedAt" TIMESTAMP(3),
    "verifiedById" UUID,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "report_deliveries" (
    "id" UUID NOT NULL,
    "resultId" UUID NOT NULL,
    "channel" "DeliveryChannel" NOT NULL,
    "recipient" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "error" TEXT,

    CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tests_slug_key" ON "tests"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "test_items_testId_order_key" ON "test_items"("testId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "interpretations_testId_patternCode_key" ON "interpretations"("testId", "patternCode");

-- CreateIndex
CREATE UNIQUE INDEX "test_sessions_token_key" ON "test_sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "psychologist_profiles_userId_key" ON "psychologist_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "session_tests_sessionId_testId_key" ON "session_tests"("sessionId", "testId");

-- CreateIndex
CREATE UNIQUE INDEX "session_participants_tokenHash_key" ON "session_participants"("tokenHash");

-- CreateIndex
CREATE INDEX "attempts_sessionId_idx" ON "attempts"("sessionId");

-- CreateIndex
CREATE INDEX "attempts_testId_idx" ON "attempts"("testId");

-- CreateIndex
CREATE UNIQUE INDEX "responses_attemptId_itemId_key" ON "responses"("attemptId", "itemId");

-- CreateIndex
CREATE UNIQUE INDEX "test_results_attemptId_key" ON "test_results"("attemptId");

-- CreateIndex
CREATE UNIQUE INDEX "test_results_verifyCode_key" ON "test_results"("verifyCode");

-- CreateIndex
CREATE INDEX "test_results_status_idx" ON "test_results"("status");

-- CreateIndex
CREATE UNIQUE INDEX "invoices_number_key" ON "invoices"("number");

-- CreateIndex
CREATE INDEX "orders_userId_idx" ON "orders"("userId");

-- CreateIndex
CREATE INDEX "orders_status_amount_idx" ON "orders"("status", "amount");

-- AddForeignKey
ALTER TABLE "test_items" ADD CONSTRAINT "test_items_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interpretations" ADD CONSTRAINT "interpretations_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_sessions" ADD CONSTRAINT "test_sessions_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_tests" ADD CONSTRAINT "session_tests_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_tests" ADD CONSTRAINT "session_tests_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_participants" ADD CONSTRAINT "session_participants_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "test_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "session_participants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "responses" ADD CONSTRAINT "responses_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "institutions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_testId_fkey" FOREIGN KEY ("testId") REFERENCES "tests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_deliveries" ADD CONSTRAINT "report_deliveries_resultId_fkey" FOREIGN KEY ("resultId") REFERENCES "test_results"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add CHECK constraint: exactly one owner (userId XOR participantId) — see docs/features/01-foundation.md
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_owner_xor" CHECK (("userId" IS NULL) <> ("participantId" IS NULL));

