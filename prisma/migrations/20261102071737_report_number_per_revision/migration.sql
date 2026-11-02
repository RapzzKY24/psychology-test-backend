-- A revision keeps the same report number, so the number alone can no longer
-- be unique: uniqueness moves to (number, revision).
DROP INDEX "reports_number_key";

CREATE UNIQUE INDEX "reports_number_revision_key" ON "reports"("number", "revision");
