/**
 * lib/session.ts — The rules for a live workout, as plain functions.
 *
 * The session screen (app/session/[id].tsx) keeps a `SessionProgress`
 * object in React state and uses these helpers to answer questions like
 * "which set is next for this exercise?" or "is the whole workout done?".
 *
 * Why separate from the screen: these are pure functions (same input → same
 * output, no React, no network), so they're easy to read and reason about on
 * their own, and the screen file stays focused on layout.
 *
 * Difference from the backend's WorkoutSession class: that class forces a
 * strict order (all sets of exercise 1, then exercise 2...) which suits the
 * terminal app. On the phone the user spins the dial to ANY exercise and logs
 * it, so here each exercise simply tracks its own logged sets.
 */
import type { Exercise, PreviousPerformance, PreviousSet, Workout } from '@/api/types';

/** A set the user logged in THIS session. */
export type LoggedSet = { setNumber: number; weight: number; reps: number };

/**
 * Everything logged so far, keyed by exercise id.
 * e.g. { 4: [{ setNumber: 1, weight: 135, reps: 8 }] }
 */
export type SessionProgress = Record<number, LoggedSet[]>;

/** Sets logged so far for one exercise (empty array if none). */
export function loggedFor(progress: SessionProgress, exercise: Exercise): LoggedSet[] {
  return progress[exercise.id] ?? [];
}

/** True once every planned set of the exercise has been logged. */
export function isExerciseDone(progress: SessionProgress, exercise: Exercise): boolean {
  return loggedFor(progress, exercise).length >= exercise.sets;
}

/**
 * The 1-based set number the user is on for this exercise
 * (= sets logged + 1). Capped at the planned set count so a finished exercise
 * reports its last set rather than "set 4 of 3".
 */
export function currentSetNumber(progress: SessionProgress, exercise: Exercise): number {
  return Math.min(loggedFor(progress, exercise).length + 1, exercise.sets);
}

/**
 * Overall progress as [completed sets, total sets] — the same idea as the
 * backend's WorkoutProgress tuple. Extra sets beyond the plan don't count
 * twice, thanks to Math.min.
 */
export function totals(workout: Workout, progress: SessionProgress): [done: number, total: number] {
  let done = 0;
  let total = 0;
  for (const exercise of workout.exercises) {
    total += exercise.sets;
    done += Math.min(loggedFor(progress, exercise).length, exercise.sets);
  }
  return [done, total];
}

/** True when every exercise is done. */
export function isWorkoutDone(workout: Workout, progress: SessionProgress): boolean {
  return workout.exercises.every((exercise) => isExerciseDone(progress, exercise));
}

/** Return a NEW progress object with one more set recorded (React state must not be mutated). */
export function withLoggedSet(progress: SessionProgress, exercise: Exercise, set: LoggedSet): SessionProgress {
  return { ...progress, [exercise.id]: [...loggedFor(progress, exercise), set] };
}

/**
 * Index of the next exercise that still has sets left, searching forward
 * from `fromIndex` and wrapping around (like the dial itself).
 * Returns -1 when everything is done.
 */
export function nextIncompleteIndex(workout: Workout, progress: SessionProgress, fromIndex: number): number {
  const count = workout.exercises.length;
  for (let step = 1; step <= count; step++) {
    const index = (fromIndex + step) % count;
    const exercise = workout.exercises[index];
    if (exercise && !isExerciseDone(progress, exercise)) return index;
  }
  return -1;
}

/**
 * The greyed-out "last time" numbers for a given set.
 *
 * Looks for the same set number from the previous session. If last time had
 * fewer sets (say you did 2 and now plan 3), it falls back to the LAST set
 * from last time, which is usually the best guess. Returns undefined when the
 * exercise has never been done before.
 */
export function previousFor(previous: PreviousPerformance[], exercise: Exercise, setNumber: number): PreviousSet | undefined {
  const entry = previous.find((p) => p.exerciseId === exercise.id);
  if (!entry || entry.sets.length === 0) return undefined;
  return entry.sets.find((s) => s.setNumber === setNumber) ?? entry.sets[entry.sets.length - 1];
}

/**
 * Parse what the user typed into the weight/reps boxes.
 *  - Empty box → use the previous value (so "same as last time" is one tap).
 *  - Otherwise it must be a valid number.
 * Returns either the numbers or an error message to show.
 */
export function parseSetInput(
  weightText: string,
  repsText: string,
  previous: PreviousSet | undefined,
  targetReps: number,
): { ok: true; weight: number; reps: number } | { ok: false; message: string } {
  // Accept "22,5" as well as "22.5" (some phone keyboards only offer a comma).
  const weightRaw = weightText.trim().replace(',', '.');
  const repsRaw = repsText.trim();

  const weight = weightRaw === '' ? previous?.weight : Number(weightRaw);
  // If there's no previous reps either, default to the target reps from the plan.
  const reps = repsRaw === '' ? previous?.reps ?? targetReps : Number(repsRaw);

  if (weight === undefined) return { ok: false, message: 'Tap the weight to enter it (use 0 for bodyweight).' };
  if (!Number.isFinite(weight) || weight < 0) return { ok: false, message: 'Weight must be 0 or more.' };
  if (!Number.isInteger(reps) || reps <= 0) return { ok: false, message: 'Reps must be a whole number above 0.' };
  return { ok: true, weight, reps };
}

/** 125 → "2:05" for the rest countdown. */
export function formatSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

/** Format a weight without pointless decimals: 135 → "135", 22.5 → "22.5". */
export function formatWeight(weight: number): string {
  return Number.isInteger(weight) ? String(weight) : weight.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}

/** "Bench Press" → "BP", "Squat" → "SQ" — the label inside the small dial nodes. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return (words[0] ?? '').slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0] ?? '').join('').toUpperCase();
}
