/**
 * repositories/SessionRepository.ts — All SQL for workout HISTORY
 * (tables `workout_sessions` and `completed_sets`).
 *
 * Like WorkoutRepository, this is the only place that knows how sessions are
 * stored. It returns plain objects (types below) rather than WorkoutSession
 * instances, because history is read-only data for display.
 *
 * pg conversion quirks handled here:
 *   - BIGINT ids come back as strings → converted with Number().
 *   - COUNT(...) returns BIGINT (a string) → cast in SQL with ::int.
 *   - NUMERIC (weight) comes back as a string → cast in SQL with ::float8.
 *   - Column aliases in double quotes (AS "workoutId") turn snake_case
 *     columns into camelCase keys so rows match the TypeScript types.
 *
 * NEW FOR THE FRONTEND:
 *   - findState()               → lets the service reject sets for missing / finished sessions
 *   - deleteSession()           → "discard workout" when the user backs out
 *   - findPreviousPerformance() → the greyed-out "last time" weight/reps
 *                                 shown inside each exercise node
 */
import { pool } from "../database/connection.js";
import type { CompletedSetInput } from "../models/CompletedSet.js";

/** One row in the history list. workoutId is null if the workout template was deleted. */
export type WorkoutSessionSummary = { id: number; workoutId: number | null; workoutName: string; startedAt: Date; completedAt: Date | null; setCount: number };

/** A summary plus every set logged in that session. (`&` combines two types.) */
export type WorkoutSessionDetails = WorkoutSessionSummary & { completedSets: Array<{ id: number; exerciseId: number | null; exerciseName: string; setNumber: number; weight: number; reps: number; completedAt: Date }> };

/**
 * What the user did the LAST time they performed an exercise.
 * `sets` is ordered by set number. `performedAt` is when that session started.
 */
export type PreviousPerformance = {
    exerciseId: number;
    performedAt: Date;
    sets: Array<{ setNumber: number; weight: number; reps: number }>;
};

/** Shared SELECT for the summary queries (used by findAll and findById). */
const SUMMARY_SQL = `
    SELECT s.id,
           s.workout_id   AS "workoutId",
           s.workout_name AS "workoutName",
           s.started_at   AS "startedAt",
           s.completed_at AS "completedAt",
           COUNT(cs.id)::int AS "setCount"
    FROM workout_sessions s
    LEFT JOIN completed_sets cs ON cs.session_id = s.id`;

/** Convert the string ids pg returns into numbers. */
function toSummary(row: WorkoutSessionSummary): WorkoutSessionSummary {
    return { ...row, id: Number(row.id), workoutId: row.workoutId === null ? null : Number(row.workoutId), setCount: Number(row.setCount) };
}

export class SessionRepository {
    /**
     * Insert a new session row and return its generated id.
     * workoutName is stored as a snapshot so history survives renames/deletes.
     */
    async createSession(workoutId: number, workoutName: string, startedAt: Date): Promise<number> {
        const result = await pool.query<{ id: number }>(
            "INSERT INTO workout_sessions (workout_id, workout_name, started_at) VALUES ($1, $2, $3) RETURNING id",
            [workoutId, workoutName, startedAt]
        );
        const row = result.rows[0];
        if (!row) throw new Error("Session insert returned no row.");
        return Number(row.id);
    }

    /**
     * NEW: does the session exist, and is it finished?
     * Returns null if there's no session with that id.
     */
    async findState(sessionId: number): Promise<{ completed: boolean } | null> {
        const result = await pool.query<{ completed_at: Date | null }>("SELECT completed_at FROM workout_sessions WHERE id = $1", [sessionId]);
        const row = result.rows[0];
        return row ? { completed: row.completed_at !== null } : null;
    }

    /**
     * Save one completed set. A missing exerciseId is stored as NULL, and a
     * missing completedAt defaults to now.
     * (The service now checks the session exists and isn't completed before
     * calling this — see SessionService.recordCompletedSet.)
     */
    async addCompletedSet(input: CompletedSetInput): Promise<void> {
        await pool.query(
            "INSERT INTO completed_sets (session_id, exercise_id, exercise_name, set_number, weight, reps, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
            [input.sessionId, input.exerciseId ?? null, input.exerciseName, input.setNumber, input.weight, input.reps, input.completedAt ?? new Date()]
        );
    }

    /**
     * Stamp completed_at on a session. Returns false if no session has that id
     * (the service turns that into a NotFoundError → 404).
     */
    async completeSession(sessionId: number, completedAt: Date): Promise<boolean> {
        const result = await pool.query("UPDATE workout_sessions SET completed_at = $1 WHERE id = $2", [completedAt, sessionId]);
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * NEW: delete a session and (via ON DELETE CASCADE) all its sets.
     * Used when the user leaves a workout and chooses "Discard".
     */
    async deleteSession(sessionId: number): Promise<boolean> {
        const result = await pool.query("DELETE FROM workout_sessions WHERE id = $1", [sessionId]);
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * All sessions, newest first, each with how many sets were logged.
     * LEFT JOIN (not plain JOIN) so sessions with zero sets still appear with
     * setCount 0. GROUP BY s.id collapses the joined set rows back to one row
     * per session so COUNT can tally them.
     * Note: this includes unfinished sessions (completedAt null).
     */
    async findAll(): Promise<WorkoutSessionSummary[]> {
        const result = await pool.query<WorkoutSessionSummary>(`${SUMMARY_SQL} GROUP BY s.id ORDER BY s.started_at DESC`);
        return result.rows.map(toSummary);
    }

    /**
     * One session's full details, or null if not found. Two queries:
     *   1. The session summary (same SQL as findAll, filtered by id).
     *   2. Its sets, in the order they were done (completed_at, then id as a
     *      tie-breaker).
     */
    async findById(id: number): Promise<WorkoutSessionDetails | null> {
        const session = await pool.query<WorkoutSessionSummary>(`${SUMMARY_SQL} WHERE s.id = $1 GROUP BY s.id`, [id]);
        const row = session.rows[0];
        if (!row) return null;
        const sets = await pool.query<WorkoutSessionDetails["completedSets"][number]>(
            "SELECT id, exercise_id AS \"exerciseId\", exercise_name AS \"exerciseName\", set_number AS \"setNumber\", weight::float8 AS weight, reps, completed_at AS \"completedAt\" FROM completed_sets WHERE session_id = $1 ORDER BY completed_at, id",
            [id]
        );
        return {
            ...toSummary(row),
            completedSets: sets.rows.map((set) => ({ ...set, id: Number(set.id), exerciseId: set.exerciseId === null ? null : Number(set.exerciseId) })),
        };
    }

    /**
     * NEW: for every exercise in a workout, the sets logged the LAST time the
     * user did that exercise. Powers the greyed-out numbers in the session
     * screen ("last time: 135 × 8").
     *
     * How a past set is matched to a template exercise:
     *   - completed_sets.exercise_id equals the exercise's id, OR
     *   - the names match (case/space-insensitive). This fallback covers old
     *     history whose exercise_id was set to NULL by the previous
     *     delete-and-reinsert edit logic, and lets "Bench Press" in another
     *     workout count as the last time you benched.
     *
     * The SQL, step by step (WITH ... = named sub-queries, read top to bottom):
     *   ex      — this workout's exercises
     *   matched — every past set that matches one of them, plus its session's start time
     *   latest  — for each exercise, the single most recent session it appears in.
     *             DISTINCT ON (exercise_id) keeps the FIRST row per exercise
     *             according to the ORDER BY, i.e. the newest session.
     *   final   — only the sets from that latest session, ordered by set number.
     *
     * `excludeSessionId` lets the app ask "previous, not counting the session
     * I'm in right now" (pass 0 / omit to include everything).
     */
    async findPreviousPerformance(workoutId: number, excludeSessionId = 0): Promise<PreviousPerformance[]> {
        const result = await pool.query<{ exercise_id: number; started_at: Date; set_number: number; weight: number; reps: number }>(
            `WITH ex AS (
                 SELECT id, lower(trim(name)) AS key FROM exercises WHERE workout_id = $1
             ),
             matched AS (
                 SELECT ex.id AS exercise_id, cs.session_id, s.started_at, cs.set_number,
                        cs.weight::float8 AS weight, cs.reps, cs.completed_at, cs.id AS set_id
                 FROM ex
                 JOIN completed_sets cs
                   ON cs.exercise_id = ex.id OR lower(trim(cs.exercise_name)) = ex.key
                 JOIN workout_sessions s ON s.id = cs.session_id
                 WHERE s.id <> $2
             ),
             latest AS (
                 SELECT DISTINCT ON (exercise_id) exercise_id, session_id
                 FROM matched
                 ORDER BY exercise_id, started_at DESC, session_id DESC
             )
             SELECT m.exercise_id, m.started_at, m.set_number, m.weight, m.reps
             FROM matched m
             JOIN latest l ON l.exercise_id = m.exercise_id AND l.session_id = m.session_id
             ORDER BY m.exercise_id, m.set_number, m.completed_at, m.set_id`,
            [workoutId, excludeSessionId]
        );

        // Group the flat rows into one entry per exercise. A Map keeps
        // insertion order and gives quick lookup by exercise id.
        const byExercise = new Map<number, PreviousPerformance>();
        for (const row of result.rows) {
            const exerciseId = Number(row.exercise_id);
            let entry = byExercise.get(exerciseId);
            if (!entry) {
                entry = { exerciseId, performedAt: row.started_at, sets: [] };
                byExercise.set(exerciseId, entry);
            }
            // If the same set number was somehow logged twice, keep the later
            // one (rows are ordered by completed_at, so it overwrites).
            const existing = entry.sets.find((s) => s.setNumber === row.set_number);
            if (existing) { existing.weight = row.weight; existing.reps = row.reps; }
            else entry.sets.push({ setNumber: row.set_number, weight: row.weight, reps: row.reps });
        }
        return [...byExercise.values()];
    }
}
