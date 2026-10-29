import { CompletedSet } from "./CompletedSet.js";
import { Exercise } from "./Exercise.js";
import { Workout } from "./Workout.js";

export type SessionStatus = "not-started" | "active" | "resting" | "completed";
export type WorkoutProgress = [completedSets: number, totalSets: number, percentage: number];

export class WorkoutSession {
    private readonly completedSets: CompletedSet[] = [];
    private currentExerciseIndex = 0;
    private currentSetNumber = 1;
    private restEndsAt: Date | undefined;
    private restTimer: NodeJS.Timeout | undefined;
    private status: SessionStatus = "not-started";
    private startedAt: Date | undefined;
    private completedAt: Date | undefined;

    constructor(private readonly workout: Workout, public readonly id?: number) {}
    start(): void {
        if (this.status !== "not-started") throw new Error("This workout session has already started.");
        if (this.workout.getExercises().length === 0) throw new Error("A workout must have at least one exercise.");
        this.status = "active"; this.startedAt = new Date();
    }
    getCurrentExercise(): Exercise | undefined { return this.workout.getExercises()[this.currentExerciseIndex]; }
    getCurrentSetNumber(): number { return this.currentSetNumber; }
    getStatus(): SessionStatus { return this.status; }
    getCompletedSets(): readonly CompletedSet[] { return this.completedSets; }
    getProgress(): WorkoutProgress {
        const totalSets = this.workout.getExercises().reduce((total, exercise) => total + exercise.sets, 0);
        const completedSets = this.completedSets.length;
        return [completedSets, totalSets, totalSets === 0 ? 0 : (completedSets / totalSets) * 100];
    }
    getStartedAt(): Date | undefined { return this.startedAt; }
    getCompletedAt(): Date | undefined { return this.completedAt; }
    getWorkoutName(): string { return this.workout.name; }
    getWorkoutId(): number | undefined { return this.workout.id; }
    getRemainingRestSeconds(): number {
        return this.restEndsAt === undefined ? 0 : Math.max(0, Math.ceil((this.restEndsAt.getTime() - Date.now()) / 1000));
    }
    recordCompletedSet(weight: number, reps: number): void {
        if (this.status !== "active") throw new Error("You can only record a set while the session is active.");
        const exercise = this.getCurrentExercise();
        if (!exercise) throw new Error("There is no exercise left in this workout.");
        this.completedSets.push(new CompletedSet(exercise.name, this.currentSetNumber, weight, reps, new Date(), exercise.id));
        if (this.currentExerciseIndex === this.workout.getExercises().length - 1 && this.currentSetNumber === exercise.sets) this.finish();
        else this.startRest(exercise.restTimeMinutes);
    }
    waitForRest(): Promise<void> {
        if (this.status !== "resting") return Promise.resolve();
        return new Promise((resolve) => { const timer = setInterval(() => { if (this.status !== "resting") { clearInterval(timer); resolve(); } }, 100); });
    }
    skipRest(): void { if (this.status !== "resting") throw new Error("There is no rest timer to skip."); if (this.restTimer) clearTimeout(this.restTimer); this.finishRest(); }
    private startRest(minutes: number): void { this.status = "resting"; this.restEndsAt = new Date(Date.now() + minutes * 60_000); this.restTimer = setTimeout(() => this.finishRest(), minutes * 60_000); }
    private finishRest(): void { if (this.status !== "resting") return; this.restTimer = undefined; this.restEndsAt = undefined; const exercise = this.getCurrentExercise(); if (exercise && this.currentSetNumber < exercise.sets) this.currentSetNumber++; else { this.currentExerciseIndex++; this.currentSetNumber = 1; } this.status = "active"; }
    private finish(): void { if (this.restTimer) clearTimeout(this.restTimer); this.restTimer = undefined; this.restEndsAt = undefined; this.status = "completed"; this.completedAt = new Date(); }
}
