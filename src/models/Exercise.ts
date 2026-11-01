/**
 * models/Exercise.ts — One exercise inside a workout template
 * (e.g. "Bench Press: 3 sets of 10 reps, 2 minutes rest").
 *
 * Two shapes live here:
 *   - ExerciseInput: plain data as it arrives from the outside world
 *     (an HTTP request body or the terminal prompts). Not yet validated.
 *   - Exercise: the validated, immutable object the rest of the app uses.
 */

/** Raw exercise data from a request body / CLI. Validated in WorkoutService.toWorkout(). */
export type ExerciseInput = {
    /**
     * NEW: the database id of an exercise that already exists.
     * When editing a workout, the frontend sends the id back for every
     * exercise it kept. WorkoutRepository.update() then UPDATES that row
     * instead of deleting and re-inserting it, so the exercise keeps its id
     * and its link to past completed sets (needed for "previous weight/reps").
     * Leave it out for brand-new exercises.
     */
    id?: number;
    name: string;
    reps: number;
    sets: number;
    restTimeMinutes: number;
    exerciseOrder?: number; // optional; WorkoutService ignores it and uses array position instead
};

/**
 * An exercise in a workout template.
 *
 * TypeScript shorthand: writing `public readonly name: string` in the
 * constructor's parameter list both DECLARES the property and ASSIGNS it, so
 * the empty constructor body `{}` is all that's needed.
 * `readonly` means a property can't be reassigned after construction.
 */
export class Exercise {
    constructor(
        public readonly name: string,
        public readonly reps: number,            // target reps per set
        public readonly sets: number,            // how many sets to perform
        public readonly restTimeMinutes: number, // rest between sets, in whole minutes
        public readonly id?: number,             // database id; undefined until saved
        public readonly exerciseOrder?: number   // 1-based position in the workout
    ) {}
}
