/**
 * services/SessionService.ts — Business rules for workout sessions (history).
 *
 * Validates input, then calls SessionRepository to save/load. It also uses
 * WorkoutService to look up the workout a session is started from.
 */
import { WorkoutSession } from "../models/WorkoutSession.js";
import type { CompletedSetInput } from "../models/CompletedSet.js";
import { SessionRepository, type WorkoutSessionDetails, type WorkoutSessionSummary } from "../repositories/SessionRepository.js";
import { WorkoutService } from "./WorkoutService.js";

export class SessionService {
    // Default dependencies; a test could pass fakes instead.
    constructor(private readonly sessions = new SessionRepository(), private readonly workouts = new WorkoutService()) {}

    /**
     * Start a session for a workout:
     *   1. Load the workout (throws "not found" if it doesn't exist).
     *   2. Create an in-memory WorkoutSession and start() it (this checks the
     *      workout has exercises and records the start time).
     *   3. Save a workout_sessions row and return its id with the live session.
     * The terminal app keeps using the returned `session` to step through sets.
     * REVIEW NOTE: the API only uses the id and start time, then the session
     * object is thrown away, so the API doesn't track current set / rest state
     * on the server; the client is trusted to send correct set data.
     */
    async startSession(workoutId: number): Promise<{ id: number; session: WorkoutSession }> { const workout = await this.workouts.getWorkout(workoutId); const session = new WorkoutSession(workout); session.start(); const id = await this.sessions.createSession(workoutId, workout.name, session.getStartedAt() ?? new Date()); return { id, session }; }

    /**
     * Validate and save one completed set. Weight may be 0 or a decimal;
     * reps must be a positive whole number.
     * `Omit<CompletedSetInput, "completedAt">` = same type minus completedAt
     * (the repository fills in the current time).
     * REVIEW NOTE: sessionId, setNumber and exerciseName aren't validated here.
     * A blank exerciseName or setNumber of 0 will be rejected by the database
     * (NOT NULL / CHECK) and show up as a 500 instead of a 400.
     */
    async recordCompletedSet(input: Omit<CompletedSetInput, "completedAt">): Promise<void> { if (!Number.isFinite(input.weight) || input.weight < 0) throw new Error("Weight must be zero or greater."); if (!Number.isInteger(input.reps) || input.reps <= 0) throw new Error("Reps must be a positive integer."); await this.sessions.addCompletedSet(input); }

    /** Mark a session finished (sets completed_at to now). */
    async completeSession(id: number): Promise<void> { if (!Number.isInteger(id) || id <= 0) throw new Error("ID must be a positive integer."); await this.sessions.completeSession(id, new Date()); }

    /** All sessions, newest first. */
    async listHistory(): Promise<WorkoutSessionSummary[]> { return this.sessions.findAll(); }

    /**
     * One session with its sets, or throw "Session not found." (→ 404).
     * REVIEW NOTE: unlike the other methods, the id isn't validated, so
     * GET /api/sessions/abc sends NaN to Postgres and returns a 500.
     */
    async getHistory(id: number): Promise<WorkoutSessionDetails> { const result = await this.sessions.findById(id); if (!result) throw new Error("Session not found."); return result; }
}
