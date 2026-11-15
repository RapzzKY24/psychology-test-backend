-- IST is one cover with nine separately timed subtests, each with its own raw
-- score and its own norm row. None of the existing families can hold that, so
-- the battery gets a family of its own.
ALTER TYPE "ScorerType" ADD VALUE 'MULTI_SUBTEST';
