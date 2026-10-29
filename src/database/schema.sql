-- =============================================================================
-- schema.sql — Database structure for EverythingFitness.
--
-- Run this once against a fresh PostgreSQL database to create all tables.
-- `IF NOT EXISTS` makes it safe to run again; it won't touch existing tables
-- (which also means it will NOT upgrade an older table — that's what the
-- files in migrations/ are for).
--
-- How the four tables relate:
--
--   workouts 1 ──< exercises            A workout TEMPLATE and its exercises
--      │                  │
--      │ (SET NULL)       │ (SET NULL)
--      ▼                  ▼
--   workout_sessions 1 ──< completed_sets   A real, logged workout and each set done
--
-- Design idea: templates (workouts/exercises) can be edited or deleted freely,
-- but logged history (sessions/sets) must survive. That's why history rows
-- copy the NAME (workout_name, exercise_name) and use ON DELETE SET NULL for
-- their links back to the templates.
-- =============================================================================

-- A workout template, e.g. "Push Day".
CREATE TABLE IF NOT EXISTS workouts (
    id         BIGSERIAL PRIMARY KEY,                -- auto-incrementing 64-bit id
    name       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- TIMESTAMPTZ = timestamp with time zone
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()    -- bumped by WorkoutRepository.update()
);

-- One exercise inside a workout template, e.g. "Bench Press, 3 x 10, 2 min rest".
CREATE TABLE IF NOT EXISTS exercises (
    id                BIGSERIAL PRIMARY KEY,
    -- ON DELETE CASCADE: deleting a workout deletes its exercises too.
    workout_id        BIGINT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    name              TEXT NOT NULL,
    -- CHECK constraints are a last line of defense; the service layer
    -- (WorkoutService.toWorkout) validates the same rules first.
    reps              INTEGER NOT NULL CHECK (reps > 0),
    sets              INTEGER NOT NULL CHECK (sets > 0),
    -- REVIEW NOTE: "> 0" means a rest time of 0 minutes is not allowed, and
    -- rest can only be whole minutes (no 90-second rests).
    rest_time_minutes INTEGER NOT NULL CHECK (rest_time_minutes > 0),
    -- 1-based position of the exercise within its workout (1 = first).
    exercise_order    INTEGER NOT NULL CHECK (exercise_order > 0)
);

-- One time the user actually performed a workout.
CREATE TABLE IF NOT EXISTS workout_sessions (
    id           BIGSERIAL PRIMARY KEY,
    -- Nullable + ON DELETE SET NULL: if the template is deleted, the session
    -- stays but loses its link to the template.
    workout_id   BIGINT REFERENCES workouts(id) ON DELETE SET NULL,
    -- Snapshot of the workout's name at the time, so history still has a
    -- name to show after the template is renamed or deleted.
    workout_name TEXT NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ                          -- NULL until the session is finished
);

-- One set the user completed during a session (the actual weight and reps).
CREATE TABLE IF NOT EXISTS completed_sets (
    id            BIGSERIAL PRIMARY KEY,
    -- Deleting a session deletes its sets.
    session_id    BIGINT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    -- Link back to the template exercise; becomes NULL if that exercise row is
    -- deleted (which also happens whenever the workout is edited — see the
    -- review note in WorkoutRepository.update()).
    exercise_id   BIGINT REFERENCES exercises(id) ON DELETE SET NULL,
    exercise_name TEXT NOT NULL,                      -- name snapshot, same idea as workout_name
    set_number    INTEGER NOT NULL CHECK (set_number > 0),
    -- NUMERIC(10, 2) = exact decimal with up to 2 digits after the point
    -- (e.g. 102.50). Note: pg returns NUMERIC to JS as a STRING, which is
    -- why SessionRepository casts it with ::float8.
    weight        NUMERIC(10, 2) NOT NULL CHECK (weight >= 0),
    reps          INTEGER NOT NULL CHECK (reps > 0),
    completed_at  TIMESTAMPTZ NOT NULL
);
