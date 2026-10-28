-- Public cover image for the catalog card and the test detail page.
ALTER TABLE "tests" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
