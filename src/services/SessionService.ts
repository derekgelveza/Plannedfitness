import { WorkoutSession } from "../models/WorkoutSession.js";
import type { CompletedSetInput } from "../models/CompletedSet.js";
import { SessionRepository, type WorkoutSessionDetails, type WorkoutSessionSummary } from "../repositories/SessionRepository.js";
import { WorkoutService } from "./WorkoutService.js";

export class SessionService {
    constructor(private readonly sessions = new SessionRepository(), private readonly workouts = new WorkoutService()) {}
    async startSession(workoutId: number): Promise<{ id: number; session: WorkoutSession }> { const workout = await this.workouts.getWorkout(workoutId); const session = new WorkoutSession(workout); session.start(); const id = await this.sessions.createSession(workoutId, workout.name, session.getStartedAt() ?? new Date()); return { id, session }; }
    async recordCompletedSet(input: Omit<CompletedSetInput, "completedAt">): Promise<void> { if (!Number.isFinite(input.weight) || input.weight < 0) throw new Error("Weight must be zero or greater."); if (!Number.isInteger(input.reps) || input.reps <= 0) throw new Error("Reps must be a positive integer."); await this.sessions.addCompletedSet(input); }
    async completeSession(id: number): Promise<void> { if (!Number.isInteger(id) || id <= 0) throw new Error("ID must be a positive integer."); await this.sessions.completeSession(id, new Date()); }
    async listHistory(): Promise<WorkoutSessionSummary[]> { return this.sessions.findAll(); }
    async getHistory(id: number): Promise<WorkoutSessionDetails> { const result = await this.sessions.findById(id); if (!result) throw new Error("Session not found."); return result; }
}
