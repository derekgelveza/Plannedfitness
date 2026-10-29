/**
 * services/WorkoutService.ts — Business rules for workout templates.
 *
 * The SERVICE layer sits between the outside world (API controllers and the
 * terminal app) and the repository (SQL). Its job is to VALIDATE input and
 * turn raw data into model objects, then let the repository save/load them.
 *
 * Errors are thrown as plain Error objects with readable messages. The API's
 * error handler (server/api.ts) picks the HTTP status by looking at those
 * message words ("not found" → 404, "must"/"blank"/"positive"/"ID" → 400),
 * so the wording of these messages matters.
 */
import { Exercise, type ExerciseInput } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";
import { WorkoutRepository } from "../repositories/WorkoutRepository.js";

/** Expected request body for creating a workout. */
export type CreateWorkoutInput = { name: string; exercises: ExerciseInput[] };
/** Updating sends the same shape (full replacement, not a partial patch). */
export type UpdateWorkoutInput = CreateWorkoutInput;

export class WorkoutService {
    // The repository is a constructor parameter with a default. Normal code
    // gets a real WorkoutRepository; a test could pass in a fake one.
    constructor(private readonly repository = new WorkoutRepository()) {}

    /** Validate input, then save it. */
    async createWorkout(input: CreateWorkoutInput): Promise<Workout> { return this.repository.create(this.toWorkout(input)); }

    async listWorkouts(): Promise<Workout[]> { return this.repository.findAll(); }

    /** Fetch one workout, or throw "Workout not found." (→ 404). */
    async getWorkout(id: number): Promise<Workout> { this.assertId(id); const workout = await this.repository.findById(id); if (!workout) throw new Error("Workout not found."); return workout; }

    /** Validate input and replace the workout entirely, or throw "not found". */
    async updateWorkout(id: number, input: UpdateWorkoutInput): Promise<Workout> { this.assertId(id); const workout = await this.repository.update(id, this.toWorkout(input)); if (!workout) throw new Error("Workout not found."); return workout; }

    /** Delete, or throw "not found" if nothing was deleted. */
    async deleteWorkout(id: number): Promise<void> { this.assertId(id); if (!(await this.repository.delete(id))) throw new Error("Workout not found."); }

    /**
     * Validate raw input and build a Workout. Rules:
     *   - workout name must not be blank (after trimming spaces)
     *   - at least one exercise
     *   - each exercise name must not be blank
     *   - reps, sets and rest time must be positive whole numbers
     * Exercise order is taken from array position (i + 1).
     *
     * `?.` (optional chaining) avoids a crash if name is missing entirely.
     * The `for ... of [[label, value], ...] as const` loop checks the three
     * numeric fields with one piece of code and names the bad one in the error.
     */
    private toWorkout(input: CreateWorkoutInput): Workout { const name = input.name?.trim(); if (!name) throw new Error("Workout name must not be blank."); if (!Array.isArray(input.exercises) || input.exercises.length === 0) throw new Error("A workout must have at least one exercise."); return new Workout(name, input.exercises.map((e, i) => { const exerciseName = e.name?.trim(); if (!exerciseName) throw new Error("Exercise names must not be blank."); for (const [label, value] of [["reps", e.reps], ["sets", e.sets], ["rest time", e.restTimeMinutes]] as const) if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`); return new Exercise(exerciseName, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1); })); }

    /**
     * Reject ids that aren't positive whole numbers. Matters for the API:
     * "/api/workouts/abc" gives Number("abc") = NaN, which is caught here
     * as a 400 instead of reaching the database.
     */
    private assertId(id: number): void { if (!Number.isInteger(id) || id <= 0) throw new Error("ID must be a positive integer."); }
}
