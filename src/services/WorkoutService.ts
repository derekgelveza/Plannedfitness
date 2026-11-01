/**
 * services/WorkoutService.ts — Business rules for workout templates.
 *
 * The SERVICE layer sits between the outside world (API controllers and the
 * terminal app) and the repository (SQL). Its job is to VALIDATE input and
 * turn raw data into model objects, then let the repository save/load them.
 *
 * Errors: bad input throws ValidationError (→ 400) and missing records throw
 * NotFoundError (→ 404). See errors.ts — the API picks the status code from
 * the error CLASS now, not from the wording of the message.
 */
import { NotFoundError, ValidationError } from "../errors.js";
import { Exercise, type ExerciseInput } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";
import { WorkoutRepository } from "../repositories/WorkoutRepository.js";

/** Expected request body for creating a workout. */
export type CreateWorkoutInput = { name: string; exercises: ExerciseInput[] };
/**
 * Updating sends the same shape (full replacement, not a partial patch).
 * Include each kept exercise's `id` so it's updated in place (see
 * WorkoutRepository.update).
 */
export type UpdateWorkoutInput = CreateWorkoutInput;

export class WorkoutService {
    // The repository is a constructor parameter with a default. Normal code
    // gets a real WorkoutRepository; a test could pass in a fake one.
    constructor(private readonly repository = new WorkoutRepository()) {}

    /** Validate input, then save it. */
    async createWorkout(input: CreateWorkoutInput): Promise<Workout> { return this.repository.create(this.toWorkout(input)); }

    async listWorkouts(): Promise<Workout[]> { return this.repository.findAll(); }

    /** Fetch one workout, or throw NotFoundError (→ 404). */
    async getWorkout(id: number): Promise<Workout> {
        this.assertId(id);
        const workout = await this.repository.findById(id);
        if (!workout) throw new NotFoundError("Workout not found.");
        return workout;
    }

    /** Validate input and replace the workout, or throw NotFoundError. */
    async updateWorkout(id: number, input: UpdateWorkoutInput): Promise<Workout> {
        this.assertId(id);
        const workout = await this.repository.update(id, this.toWorkout(input));
        if (!workout) throw new NotFoundError("Workout not found.");
        return workout;
    }

    /** Delete, or throw NotFoundError if nothing was deleted. */
    async deleteWorkout(id: number): Promise<void> {
        this.assertId(id);
        if (!(await this.repository.delete(id))) throw new NotFoundError("Workout not found.");
    }

    /**
     * Validate raw input and build a Workout. Rules:
     *   - workout name must not be blank (after trimming spaces); it's
     *     converted to upper case
     *   - at least one exercise
     *   - each exercise name must not be blank
     *   - reps, sets and rest time must be positive whole numbers
     *   - (NEW) an exercise id, if given, must be a positive whole number
     * Exercise order is taken from array position (i + 1).
     *
     * `?.` (optional chaining) avoids a crash if a field is missing entirely
     * (request bodies are untrusted, so `input` might not match the type).
     * The `for ... of [[label, value], ...] as const` loop checks the three
     * numeric fields with one piece of code and names the bad one in the error.
     */
    private toWorkout(input: CreateWorkoutInput): Workout {
        // Workout names are always stored in CAPITALS ("push day" → "PUSH DAY"),
        // no matter how they were typed (app, API or terminal), so they look
        // the same everywhere.
        const name = typeof input?.name === "string" ? input.name.trim().toUpperCase() : "";
        if (!name) throw new ValidationError("Workout name must not be blank.");
        if (!Array.isArray(input.exercises) || input.exercises.length === 0) throw new ValidationError("A workout must have at least one exercise.");

        return new Workout(name, input.exercises.map((e, i) => {
            const exerciseName = typeof e?.name === "string" ? e.name.trim() : "";
            if (!exerciseName) throw new ValidationError("Exercise names must not be blank.");
            for (const [label, value] of [["reps", e.reps], ["sets", e.sets], ["rest time", e.restTimeMinutes]] as const)
                if (!Number.isInteger(value) || value <= 0) throw new ValidationError(`${label} must be a positive integer.`);
            // `null`/missing id = new exercise. Anything else must be a real id.
            const id = e.id === undefined || e.id === null ? undefined : e.id;
            if (id !== undefined && (!Number.isInteger(id) || id <= 0)) throw new ValidationError("Exercise id must be a positive integer.");
            return new Exercise(exerciseName, e.reps, e.sets, e.restTimeMinutes, id, i + 1);
        }));
    }

    /**
     * Reject ids that aren't positive whole numbers. Matters for the API:
     * "/api/workouts/abc" gives Number("abc") = NaN, which is caught here
     * as a 400 instead of reaching the database.
     */
    private assertId(id: number): void { if (!Number.isInteger(id) || id <= 0) throw new ValidationError("ID must be a positive integer."); }
}
