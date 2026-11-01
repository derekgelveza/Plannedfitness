/**
 * services/SessionService.ts — Business rules for workout sessions (history).
 *
 * Validates input, then calls SessionRepository to save/load. It also uses
 * WorkoutService to look up the workout a session is started from.
 *
 * How the React Native app uses this (see frontend/src/app/session/[id].tsx):
 *   1. GET  /api/workouts/:id/previous   → previous weights/reps per exercise
 *   2. POST /api/workouts/:id/sessions   → startSession()  → sessionId
 *   3. POST /api/sessions/:id/sets       → recordCompletedSet() for each set
 *   4. POST /api/sessions/:id/complete   → completeSession()
 *      or DELETE /api/sessions/:id       → discardSession() if the user quits
 *
 * In the app the user can swipe between exercises and log them in ANY order,
 * so the server does not enforce "set 1 of exercise 1, then set 2...". The
 * strict order lives only in the in-memory WorkoutSession model, which the
 * terminal app still uses.
 */
import { ConflictError, NotFoundError, ValidationError } from "../errors.js";
import { WorkoutSession } from "../models/WorkoutSession.js";
import type { CompletedSetInput } from "../models/CompletedSet.js";
import { SessionRepository, type PreviousPerformance, type WorkoutSessionDetails, type WorkoutSessionSummary } from "../repositories/SessionRepository.js";
import { WorkoutService } from "./WorkoutService.js";

/** Throws ValidationError unless `id` is a positive whole number. */
function assertId(id: number, label = "ID"): void {
    if (!Number.isInteger(id) || id <= 0) throw new ValidationError(`${label} must be a positive integer.`);
}

export class SessionService {
    // Default dependencies; a test could pass fakes instead.
    constructor(private readonly sessions = new SessionRepository(), private readonly workouts = new WorkoutService()) {}

    /**
     * Start a session for a workout:
     *   1. Load the workout (throws NotFoundError if it doesn't exist).
     *   2. Create an in-memory WorkoutSession and start() it (this checks the
     *      workout has exercises and records the start time).
     *   3. Save a workout_sessions row and return its id with the live session.
     * The terminal app keeps using the returned `session` to step through sets.
     * The API only needs the id and start time.
     */
    async startSession(workoutId: number): Promise<{ id: number; session: WorkoutSession }> {
        const workout = await this.workouts.getWorkout(workoutId);
        const session = new WorkoutSession(workout);
        session.start();
        const id = await this.sessions.createSession(workoutId, workout.name, session.getStartedAt() ?? new Date());
        return { id, session };
    }

    /**
     * Validate and save one completed set.
     *   - weight may be 0 (bodyweight) or a decimal (22.5)
     *   - reps and setNumber must be positive whole numbers
     *   - exerciseName must not be blank
     *   - (NEW) the session must exist (404) and not already be completed (409)
     * Before, bad values fell through to the database and came back as 500s.
     * `Omit<CompletedSetInput, "completedAt">` = same type minus completedAt
     * (the repository fills in the current time).
     */
    async recordCompletedSet(input: Omit<CompletedSetInput, "completedAt">): Promise<void> {
        assertId(input.sessionId, "Session ID");
        if (typeof input.exerciseName !== "string" || !input.exerciseName.trim()) throw new ValidationError("Exercise name must not be blank.");
        if (!Number.isInteger(input.setNumber) || input.setNumber <= 0) throw new ValidationError("Set number must be a positive integer.");
        if (typeof input.weight !== "number" || !Number.isFinite(input.weight) || input.weight < 0) throw new ValidationError("Weight must be zero or greater.");
        if (!Number.isInteger(input.reps) || input.reps <= 0) throw new ValidationError("Reps must be a positive integer.");
        if (input.exerciseId !== undefined && input.exerciseId !== null) assertId(input.exerciseId, "Exercise ID");

        const state = await this.sessions.findState(input.sessionId);
        if (!state) throw new NotFoundError("Session not found.");
        if (state.completed) throw new ConflictError("This session is already completed.");

        // Rebuild the object explicitly so stray fields from a request body
        // (anything the client added) never reach the repository. exerciseId
        // is only included when present because exactOptionalPropertyTypes
        // forbids `exerciseId: undefined`.
        const clean: Omit<CompletedSetInput, "completedAt"> = {
            sessionId: input.sessionId,
            exerciseName: input.exerciseName.trim(),
            setNumber: input.setNumber,
            weight: input.weight,
            reps: input.reps,
            ...(input.exerciseId !== undefined && input.exerciseId !== null ? { exerciseId: input.exerciseId } : {}),
        };
        await this.sessions.addCompletedSet(clean);
    }

    /** Mark a session finished (sets completed_at to now). */
    async completeSession(id: number): Promise<void> {
        assertId(id);
        if (!(await this.sessions.completeSession(id, new Date()))) throw new NotFoundError("Session not found.");
    }

    /** NEW: throw away a session and its sets (user quit and chose "Discard"). */
    async discardSession(id: number): Promise<void> {
        assertId(id);
        if (!(await this.sessions.deleteSession(id))) throw new NotFoundError("Session not found.");
    }

    /** All sessions, newest first. */
    async listHistory(): Promise<WorkoutSessionSummary[]> { return this.sessions.findAll(); }

    /** One session with its sets, or throw NotFoundError (→ 404). The id is now validated too. */
    async getHistory(id: number): Promise<WorkoutSessionDetails> {
        assertId(id);
        const result = await this.sessions.findById(id);
        if (!result) throw new NotFoundError("Session not found.");
        return result;
    }

    /**
     * NEW: last time's sets for every exercise in a workout. Checks the
     * workout exists first so an unknown id is a 404, not an empty list.
     */
    async getPreviousPerformance(workoutId: number, excludeSessionId = 0): Promise<PreviousPerformance[]> {
        await this.workouts.getWorkout(workoutId);
        if (!Number.isInteger(excludeSessionId) || excludeSessionId < 0) throw new ValidationError("excludeSession must be a positive integer.");
        return this.sessions.findPreviousPerformance(workoutId, excludeSessionId);
    }
}
