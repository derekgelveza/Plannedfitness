/**
 * models/WorkoutSession.ts — The live, in-memory state of someone doing a
 * workout right now: which exercise and set they're on, whether they're
 * resting, and which sets they've completed.
 *
 * It's a small STATE MACHINE:
 *
 *   not-started ──start()──► active ──recordCompletedSet()──► resting
 *                              ▲                                 │
 *                              └──── rest timer ends / skipRest()┘
 *
 *   ...and recording the LAST set of the LAST exercise goes straight from
 *   active ──► completed (no rest after the final set).
 *
 * Who uses it: the terminal app drives a full session with it. The REST API
 * only creates one in SessionService.startSession() to validate and get a
 * start time, then discards it — see the review note there.
 *
 * This class does not touch the database. Saving sets/sessions is done
 * separately through SessionService.
 */
import { CompletedSet } from "./CompletedSet.js";
import { Exercise } from "./Exercise.js";
import { Workout } from "./Workout.js";

/** The four states described in the diagram above. */
export type SessionStatus = "not-started" | "active" | "resting" | "completed";

/**
 * A labeled tuple: a fixed-length array where each position has a name.
 * e.g. [6, 12, 50] means 6 of 12 sets done, 50%.
 */
export type WorkoutProgress = [completedSets: number, totalSets: number, percentage: number];

export class WorkoutSession {
    private readonly completedSets: CompletedSet[] = [];
    private currentExerciseIndex = 0;   // 0-based index into workout.getExercises()
    private currentSetNumber = 1;       // 1-based set number within the current exercise
    private restEndsAt: Date | undefined;          // when the current rest ends (for the countdown)
    private restTimer: NodeJS.Timeout | undefined; // handle so the timer can be cancelled
    private status: SessionStatus = "not-started";
    private startedAt: Date | undefined;
    private completedAt: Date | undefined;

    // `private readonly workout` is a parameter property: it declares and
    // assigns this.workout in one go.
    constructor(private readonly workout: Workout, public readonly id?: number) {}

    /** Begin the session. Allowed only once, and only if the workout has exercises. */
    start(): void {
        if (this.status !== "not-started") throw new Error("This workout session has already started.");
        if (this.workout.getExercises().length === 0) throw new Error("A workout must have at least one exercise.");
        this.status = "active";
        this.startedAt = new Date();
    }

    // ---- Simple getters -----------------------------------------------------

    /** The exercise being worked on now, or undefined once past the last one. */
    getCurrentExercise(): Exercise | undefined { return this.workout.getExercises()[this.currentExerciseIndex]; }
    getCurrentSetNumber(): number { return this.currentSetNumber; }
    getStatus(): SessionStatus { return this.status; }
    getCompletedSets(): readonly CompletedSet[] { return this.completedSets; }

    /**
     * How far through the workout we are.
     * Total sets = sum of `sets` across all exercises (that's what reduce() does).
     * REVIEW NOTE: nothing in src/ calls this yet.
     */
    getProgress(): WorkoutProgress {
        const totalSets = this.workout.getExercises().reduce((total, exercise) => total + exercise.sets, 0);
        const completedSets = this.completedSets.length;
        return [completedSets, totalSets, totalSets === 0 ? 0 : (completedSets / totalSets) * 100];
    }

    getStartedAt(): Date | undefined { return this.startedAt; }
    getCompletedAt(): Date | undefined { return this.completedAt; }
    getWorkoutName(): string { return this.workout.name; }
    getWorkoutId(): number | undefined { return this.workout.id; }

    /**
     * Seconds left on the rest timer (0 if not resting). Used by the terminal
     * app's countdown spinner. Math.ceil so it shows "1" rather than "0" for
     * the final partial second; Math.max(0, ...) so it never goes negative.
     */
    getRemainingRestSeconds(): number {
        return this.restEndsAt === undefined ? 0 : Math.max(0, Math.ceil((this.restEndsAt.getTime() - Date.now()) / 1000));
    }

    // ---- State transitions --------------------------------------------------

    /**
     * Log the set the user just finished for the current exercise, then either
     * finish the whole workout (if that was the very last set) or start the
     * rest timer before the next set.
     */
    recordCompletedSet(weight: number, reps: number): void {
        if (this.status !== "active") throw new Error("You can only record a set while the session is active.");
        const exercise = this.getCurrentExercise();
        if (!exercise) throw new Error("There is no exercise left in this workout.");

        this.completedSets.push(new CompletedSet(exercise.name, this.currentSetNumber, weight, reps, new Date(), exercise.id));

        // On the last exercise AND its last set → the workout is done.
        // Otherwise → rest before the next set.
        if (this.currentExerciseIndex === this.workout.getExercises().length - 1 && this.currentSetNumber === exercise.sets) this.finish();
        else this.startRest(exercise.restTimeMinutes);
    }

    /**
     * Returns a Promise that resolves once the rest period is over (either the
     * timer ran out or skipRest() was called). Resolves immediately if not resting.
     *
     * How: it checks the status every 100 ms and resolves when it's no longer
     * "resting". Simple and works, though an event/callback from finishRest()
     * would avoid the polling.
     */
    waitForRest(): Promise<void> {
        if (this.status !== "resting") return Promise.resolve();
        return new Promise((resolve) => {
            const timer = setInterval(() => {
                if (this.status !== "resting") {
                    clearInterval(timer);
                    resolve();
                }
            }, 100);
        });
    }

    /** End the rest early (user pressed Enter in the terminal app). */
    skipRest(): void {
        if (this.status !== "resting") throw new Error("There is no rest timer to skip.");
        if (this.restTimer) clearTimeout(this.restTimer); // cancel the pending timeout so finishRest() doesn't run twice
        this.finishRest();
    }

    /** Enter the resting state and schedule finishRest() after `minutes`. */
    private startRest(minutes: number): void {
        this.status = "resting";
        this.restEndsAt = new Date(Date.now() + minutes * 60_000); // 60_000 ms = 1 minute (underscore is just a digit separator)
        this.restTimer = setTimeout(() => this.finishRest(), minutes * 60_000);
    }

    /**
     * Rest is over: advance to the next set, or to set 1 of the next exercise
     * if this exercise's sets are all done, and become "active" again.
     */
    private finishRest(): void {
        if (this.status !== "resting") return; // guard against being called twice
        this.restTimer = undefined;
        this.restEndsAt = undefined;

        const exercise = this.getCurrentExercise();
        // More sets left → next set of the same exercise.
        // Otherwise → move on to set 1 of the next exercise.
        if (exercise && this.currentSetNumber < exercise.sets) this.currentSetNumber++;
        else { this.currentExerciseIndex++; this.currentSetNumber = 1; }
        this.status = "active";
    }

    /** Mark the session complete and clean up any timer. */
    private finish(): void {
        if (this.restTimer) clearTimeout(this.restTimer);
        this.restTimer = undefined;
        this.restEndsAt = undefined;
        this.status = "completed";
        this.completedAt = new Date();
    }
}
