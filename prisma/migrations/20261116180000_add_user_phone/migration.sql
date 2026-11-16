-- The participant types their WhatsApp number on the profile tab so reports
-- and certificates can be delivered without admin asking again. Optional:
-- existing accounts and email-only sign-ups have no number yet.
ALTER TABLE "user" ADD COLUMN "phone" TEXT;
