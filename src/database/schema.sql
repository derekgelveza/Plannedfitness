CREATE TABLE IF NOT EXISTS workouts (
    id BIGSERIAL PRIMARY KEY, name TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS exercises (
    id BIGSERIAL PRIMARY KEY, workout_id BIGINT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE, name TEXT NOT NULL,
    reps INTEGER NOT NULL CHECK (reps > 0), sets INTEGER NOT NULL CHECK (sets > 0), rest_time_minutes INTEGER NOT NULL CHECK (rest_time_minutes > 0), exercise_order INTEGER NOT NULL CHECK (exercise_order > 0)
);
CREATE TABLE IF NOT EXISTS workout_sessions (
    id BIGSERIAL PRIMARY KEY, workout_id BIGINT REFERENCES workouts(id) ON DELETE SET NULL, workout_name TEXT NOT NULL, started_at TIMESTAMPTZ NOT NULL, completed_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS completed_sets (
    id BIGSERIAL PRIMARY KEY, session_id BIGINT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE, exercise_id BIGINT REFERENCES exercises(id) ON DELETE SET NULL, exercise_name TEXT NOT NULL,
    set_number INTEGER NOT NULL CHECK (set_number > 0), weight NUMERIC(10, 2) NOT NULL CHECK (weight >= 0), reps INTEGER NOT NULL CHECK (reps > 0), completed_at TIMESTAMPTZ NOT NULL
);
