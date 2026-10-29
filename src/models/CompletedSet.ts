/**
 * models/CompletedSet.ts — One set the user actually finished during a
 * workout session (what weight, how many reps, when).
 *
 * Two shapes live here:
 *   - CompletedSet: in-memory object tracked by WorkoutSession while a
 *     workout is in progress.
 *   - CompletedSetInput: the data needed to SAVE a set to the database
 *     (it adds sessionId so we know which session it belongs to).
 */
export class CompletedSet {
    public readonly completedAt: Date;

    constructor(
        public readonly exerciseName: string,
        public readonly setNumber: number,   // 1-based: set 1, set 2, ...
        public readonly weight: number,      // can be 0 (e.g. bodyweight exercises)
        public readonly reps: number,        // reps actually completed (may differ from the target)
        completedAt: Date = new Date(),      // defaults to "now"
        public readonly exerciseId?: number  // template exercise id, if known
    ) {
        // completedAt is a plain parameter (no `public readonly` in the list
        // above), so it's assigned to the property by hand here. Writing
        // `public readonly completedAt: Date = new Date()` in the parameter
        // list would do exactly the same thing.
        this.completedAt = completedAt;
    }
}

/**
 * Data needed to insert a row into the completed_sets table.
 * Built by the API controller (from the request body) or the terminal app,
 * then validated in SessionService.recordCompletedSet().
 */
export type CompletedSetInput = {
    sessionId: number;
    exerciseId?: number;
    exerciseName: string;
    setNumber: number;
    weight: number;
    reps: number;
    completedAt?: Date; // if omitted, SessionRepository uses the current time
};
