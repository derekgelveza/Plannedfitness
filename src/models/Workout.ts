/**
 * models/Workout.ts — A workout TEMPLATE: a name plus an ordered list of
 * exercises (e.g. "Push Day" = Bench Press, Overhead Press, Dips).
 *
 * This is the plan, not a record of doing it. Actually performing a workout
 * is modeled by WorkoutSession.
 */
import { Exercise } from "./Exercise.js";

export class Workout {
    // Kept private so outside code can't swap out the array; they must go
    // through addExercise() / getExercises().
    private readonly exercises: Exercise[];

    constructor(
        public readonly name: string,
        exercises: Exercise[] = [],
        public readonly id?: number // database id; undefined until saved
    ) {
        // Copy the array (spread `[...]`) so that if the caller later modifies
        // the array they passed in, this workout isn't affected.
        this.exercises = [...exercises];
    }

    /**
     * Append an exercise.
     * REVIEW NOTE: nothing in src/ calls this at the moment; workouts are always
     * built with their full exercise list in the constructor.
     */
    addExercise(exercise: Exercise): void { this.exercises.push(exercise); }

    /**
     * Returns the exercises in order. The return type `readonly Exercise[]`
     * tells TypeScript callers can't push/splice the array (a compile-time
     * guarantee only — it's the same array object at runtime).
     */
    getExercises(): readonly Exercise[] { return this.exercises; }
}
