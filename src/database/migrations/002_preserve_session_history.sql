-- =============================================================================
-- 002_preserve_session_history.sql
--
-- Run this migration against databases created with the original schema.
--
-- Purpose: upgrade an OLD database so that deleting a workout or exercise no
-- longer destroys (or blocks) session history. After it runs, the tables match
-- what schema.sql creates today, so a brand-new database does NOT need it.
--
-- What changes:
--   1. workout_sessions gets a workout_name column (a name snapshot).
--   2. workout_sessions.workout_id becomes optional and is set to NULL when the
--      workout is deleted, instead of the old behavior.
--   3. completed_sets.exercise_id is likewise set to NULL when the exercise
--      is deleted.
--
-- REVIEW NOTE: these statements aren't wrapped in BEGIN/COMMIT. If one fails
-- halfway, the database is left partly migrated. Wrapping the file in a
-- transaction would make it all-or-nothing. There's also no 001_ file in the
-- folder; presumably 001 was the original schema.
-- =============================================================================

-- Step 1: add the name-snapshot column (nullable for now, because existing
-- rows don't have a value yet).
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS workout_name TEXT;

-- Step 2: backfill it by copying each session's workout name from the
-- workouts table. (This is Postgres's UPDATE ... FROM join syntax.)
UPDATE workout_sessions s SET workout_name = w.name FROM workouts w WHERE s.workout_id = w.id AND s.workout_name IS NULL;

-- Step 3: now that every row has a value, make it required.
-- (This would fail if step 2 left any row NULL, i.e. a session with no
-- matching workout.)
ALTER TABLE workout_sessions ALTER COLUMN workout_name SET NOT NULL;

-- Step 4: replace the foreign key on workout_sessions.workout_id.
-- Postgres can't edit a constraint's ON DELETE rule in place, so we drop the
-- old constraint, allow NULLs, and re-add it with ON DELETE SET NULL.
-- "workout_sessions_workout_id_fkey" is the name Postgres auto-generates.
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_workout_id_fkey;
ALTER TABLE workout_sessions ALTER COLUMN workout_id DROP NOT NULL;
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE SET NULL;

-- Step 5: same treatment for completed_sets.exercise_id.
ALTER TABLE completed_sets DROP CONSTRAINT IF EXISTS completed_sets_exercise_id_fkey;
ALTER TABLE completed_sets ADD CONSTRAINT completed_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
