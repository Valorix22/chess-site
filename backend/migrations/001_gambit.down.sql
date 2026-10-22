-- Explicit rollback of additive Gambit tables; original accounts/games/ratings stay intact.
DROP TABLE IF EXISTS email_actions;
DROP TABLE IF EXISTS sanctions;
DROP TABLE IF EXISTS site_settings;
DROP TABLE IF EXISTS tournament_pairings;
DROP TABLE IF EXISTS puzzle_results;
DROP TABLE IF EXISTS puzzle_attempts;
DROP TABLE IF EXISTS puzzle_ratings;
DROP TABLE IF EXISTS content_votes;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS message_reads;
DROP TABLE IF EXISTS platform_messages;
DROP TABLE IF EXISTS progress;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS content;
DROP TABLE IF EXISTS profiles;
DROP TABLE IF EXISTS gambit_migrations;
