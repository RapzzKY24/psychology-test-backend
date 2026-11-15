-- Kuder marks each activity of a list as liked (+) or disliked (-); the
-- scorer tallies those marks per interest field and reads a percentile.
ALTER TYPE "ScorerType" ADD VALUE 'MARK_GROUP';
