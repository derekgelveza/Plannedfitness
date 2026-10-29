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
 */
import { pool } from "../database/connection.js";
import type { CompletedSetInput } from "../models/CompletedSet.js";

/** One row in the history list. workoutId is null if the workout template was deleted. */
export type WorkoutSessionSummary = { id: number; workoutId: number | null; workoutName: string; startedAt: Date; completedAt: Date | null; setCount: number };

/** A summary plus every set logged in that session. (`&` combines two types.) */
export type WorkoutSessionDetails = WorkoutSessionSummary & { completedSets: Array<{ id: number; exerciseId: number | null; exerciseName: string; setNumber: number; weight: number; reps: number; completedAt: Date }> };

export class SessionRepository {
    /**
     * Insert a new session row and return its generated id.
     * workoutName is stored as a snapshot so history survives renames/deletes.
     */
    async createSession(workoutId: number, workoutName: string, startedAt: Date): Promise<number> { const result = await pool.query<{ id: number }>("INSERT INTO workout_sessions (workout_id, workout_name, started_at) VALUES ($1, $2, $3) RETURNING id", [workoutId, workoutName, startedAt]); const row = result.rows[0]; if (!row) throw new Error("Session insert returned no row."); return Number(row.id); }

    /**
     * Save one completed set. A missing exerciseId is stored as NULL, and a
     * missing completedAt defaults to now.
     * REVIEW NOTE: nothing checks that the session exists or isn't already
     * completed. A bad sessionId fails on the foreign key and surfaces as a
     * 500 from the API rather than a 404.
     */
    async addCompletedSet(input: CompletedSetInput): Promise<void> { await pool.query("INSERT INTO completed_sets (session_id, exercise_id, exercise_name, set_number, weight, reps, completed_at) VALUES ($1, $2, $3, $4, $5, $6, $7)", [input.sessionId, input.exerciseId ?? null, input.exerciseName, input.setNumber, input.weight, input.reps, input.completedAt ?? new Date()]); }

    /**
     * Stamp completed_at on a session. rowCount 0 means no session with that
     * id, which becomes a "not found" error (→ 404 in the API).
     */
    async completeSession(sessionId: number, completedAt: Date): Promise<void> { const result = await pool.query("UPDATE workout_sessions SET completed_at = $1 WHERE id = $2", [completedAt, sessionId]); if ((result.rowCount ?? 0) === 0) throw new Error("Session not found."); }

    /**
     * All sessions, newest first, each with how many sets were logged.
     * LEFT JOIN (not plain JOIN) so sessions with zero sets still appear with
     * setCount 0. GROUP BY s.id collapses the joined set rows back to one row
     * per session so COUNT can tally them.
     * Note: this includes unfinished sessions (completedAt null).
     */
    async findAll(): Promise<WorkoutSessionSummary[]> { const result = await pool.query<WorkoutSessionSummary>("SELECT s.id, s.workout_id AS \"workoutId\", s.workout_name AS \"workoutName\", s.started_at AS \"startedAt\", s.completed_at AS \"completedAt\", COUNT(cs.id)::int AS \"setCount\" FROM workout_sessions s LEFT JOIN completed_sets cs ON cs.session_id = s.id GROUP BY s.id ORDER BY s.started_at DESC"); return result.rows.map((row) => ({ ...row, id: Number(row.id), workoutId: row.workoutId === null ? null : Number(row.workoutId), setCount: Number(row.setCount) })); }

    /**
     * One session's full details, or null if not found. Two queries:
     *   1. The session summary (same SQL as findAll, filtered by id).
     *   2. Its sets, in the order they were done (completed_at, then id as a
     *      tie-breaker).
     * Then ids are converted to numbers and everything is merged into one
     * object with the spread operator (`...row`).
     */
    async findById(id: number): Promise<WorkoutSessionDetails | null> { const session = await pool.query<WorkoutSessionSummary>("SELECT s.id, s.workout_id AS \"workoutId\", s.workout_name AS \"workoutName\", s.started_at AS \"startedAt\", s.completed_at AS \"completedAt\", COUNT(cs.id)::int AS \"setCount\" FROM workout_sessions s LEFT JOIN completed_sets cs ON cs.session_id = s.id WHERE s.id = $1 GROUP BY s.id", [id]); const row = session.rows[0]; if (!row) return null; const sets = await pool.query<WorkoutSessionDetails["completedSets"][number]>("SELECT id, exercise_id AS \"exerciseId\", exercise_name AS \"exerciseName\", set_number AS \"setNumber\", weight::float8 AS weight, reps, completed_at AS \"completedAt\" FROM completed_sets WHERE session_id = $1 ORDER BY completed_at, id", [id]); return { ...row, id: Number(row.id), workoutId: row.workoutId === null ? null : Number(row.workoutId), setCount: Number(row.setCount), completedSets: sets.rows.map((set) => ({ ...set, id: Number(set.id), exerciseId: set.exerciseId === null ? null : Number(set.exerciseId) })) }; }
}
