-- User.id is a plain string (better-auth generates its own ids), so the audit
-- columns that store a user id cannot be uuid.
ALTER TABLE "reports" ALTER COLUMN "filledById" TYPE TEXT USING "filledById"::text;
ALTER TABLE "reports" ALTER COLUMN "issuedById" TYPE TEXT USING "issuedById"::text;
ALTER TABLE "reports" ALTER COLUMN "revokedById" TYPE TEXT USING "revokedById"::text;
