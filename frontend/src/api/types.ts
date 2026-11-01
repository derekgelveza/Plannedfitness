/**
 * api/types.ts — The shapes of the JSON the backend sends and receives.
 *
 * These mirror the backend (Module1/src):
 *   Workout / Exercise        ← Workout.toJSON() in src/models/Workout.ts
 *   ExerciseInput             → src/models/Exercise.ts (ExerciseInput)
 *   PreviousPerformance       ← src/repositories/SessionRepository.ts
 * If you change one side, change the other.
 *
 * Dates arrive as ISO strings (e.g. "2026-10-31T22:39:05.151Z") because JSON
 * has no Date type, so they're typed as `string` here.
 */

/** One exercise inside a saved workout. Saved exercises always have an id. */
export type Exercise = {
  id: number;
  name: string;
  reps: number;            // target reps per set
  sets: number;            // number of sets
  restTimeMinutes: number; // rest between sets, whole minutes
  exerciseOrder: number;   // 1-based position
};

/** A saved workout template. */
export type Workout = {
  id: number;
  name: string;
  exercises: Exercise[];
};

/**
 * What the app SENDS when creating/updating a workout.
 * `id` is included for exercises that already exist (edit screen) so the
 * backend updates them in place and keeps their history; new ones omit it.
 */
export type ExerciseInput = {
  id?: number;
  name: string;
  reps: number;
  sets: number;
  restTimeMinutes: number;
};

export type WorkoutInput = { name: string; exercises: ExerciseInput[] };

/** One set from the last time an exercise was done. */
export type PreviousSet = { setNumber: number; weight: number; reps: number };

/** Last time's sets for one exercise (GET /api/workouts/:id/previous). */
export type PreviousPerformance = {
  exerciseId: number;
  performedAt: string;
  sets: PreviousSet[];
};

/** Response of POST /api/workouts/:id/sessions. */
export type StartedSession = { sessionId: number; startedAt: string };

/** Body of POST /api/sessions/:id/sets. */
export type CompletedSetInput = {
  exerciseId: number;
  exerciseName: string;
  setNumber: number;
  weight: number;
  reps: number;
};
