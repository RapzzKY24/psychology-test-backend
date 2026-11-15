-- EPPS adds one point per pick to the picked statement's need, reads that raw
-- score against a percentile table per need, and checks 15 repeated items for
-- consistency. None of that fits PAIR_TALLY: two statements may score the same
-- need (the item is then dropped instead of adding two points), and the norms
-- are per need rather than a single score band.
ALTER TYPE "ScorerType" ADD VALUE 'PAIR_NORM';
