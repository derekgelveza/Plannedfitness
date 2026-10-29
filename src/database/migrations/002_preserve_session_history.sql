-- Run this migration against databases created with the original schema.
ALTER TABLE workout_sessions ADD COLUMN IF NOT EXISTS workout_name TEXT;
UPDATE workout_sessions s SET workout_name = w.name FROM workouts w WHERE s.workout_id = w.id AND s.workout_name IS NULL;
ALTER TABLE workout_sessions ALTER COLUMN workout_name SET NOT NULL;
ALTER TABLE workout_sessions DROP CONSTRAINT IF EXISTS workout_sessions_workout_id_fkey;
ALTER TABLE workout_sessions ALTER COLUMN workout_id DROP NOT NULL;
ALTER TABLE workout_sessions ADD CONSTRAINT workout_sessions_workout_id_fkey FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE SET NULL;
ALTER TABLE completed_sets DROP CONSTRAINT IF EXISTS completed_sets_exercise_id_fkey;
ALTER TABLE completed_sets ADD CONSTRAINT completed_sets_exercise_id_fkey FOREIGN KEY (exercise_id) REFERENCES exercises(id) ON DELETE SET NULL;
