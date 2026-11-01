/**
 * repositories/WorkoutRepository.ts — All SQL for workout templates and
 * their exercises (tables `workouts` and `exercises`).
 *
 * The REPOSITORY pattern: this is the only file that knows how workouts are
 * stored. Services call these methods and get back Workout/Exercise objects,
 * never raw database rows. That keeps SQL out of the business logic.
 *
 * Two pg quirks explain all the Number(...) calls in this file:
 *   - BIGSERIAL / BIGINT columns come back from `pg` as STRINGS (because a
 *     64-bit integer can exceed JavaScript's safe number range), so ids are
 *     converted with Number(). The row types below say `number`, but at
 *     runtime those ids are actually strings until converted.
 *   - $1, $2, ... are query PARAMETERS. pg sends the values separately from
 *     the SQL text, which prevents SQL injection. Never build SQL by
 *     concatenating user input.
 *
 * CHANGES FOR THE FRONTEND:
 *   - create() and update() now re-read the workout before returning, so the
 *     returned exercises carry their real database ids (the app needs them
 *     to edit the workout again and to look up previous weights/reps).
 *   - update() no longer deletes and re-inserts every exercise. It updates
 *     the rows the caller kept (matched by id), inserts the new ones and
 *     deletes only the ones that were removed. Exercise ids stay stable, so
 *     history (completed_sets.exercise_id) keeps pointing at them.
 */
import type { PoolClient } from "pg";
import { pool } from "../database/connection.js";
import { Exercise } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";

/** Shape of a row from `SELECT id, name FROM workouts`. */
type WorkoutRow = { id: number; name: string };

/** Shape of a row from the `exercises` table (snake_case, like the columns). */
type ExerciseRow = { id: number; workout_id: number; name: string; reps: number; sets: number; rest_time_minutes: number; exercise_order: number };

/** Anything with a .query() method: the shared pool OR one borrowed connection. */
type Queryable = PoolClient | typeof pool;

/**
 * Convert database rows into a Workout object.
 *
 * `exercises` may contain exercises for MANY workouts (findAll loads them all
 * in one query), so this picks out the ones belonging to this workout, sorts
 * them by exercise_order, and turns each row into an Exercise.
 */
function toWorkout(row: WorkoutRow, exercises: ExerciseRow[]): Workout {
    const workoutId = Number(row.id);
    return new Workout(
        row.name,
        exercises
            .filter((e) => Number(e.workout_id) === workoutId)          // only this workout's exercises
            .sort((a, b) => a.exercise_order - b.exercise_order)        // in their saved order
            .map((e) => new Exercise(e.name, e.reps, e.sets, e.rest_time_minutes, Number(e.id), e.exercise_order)),
        workoutId
    );
}

/**
 * Load exercise rows for the given workouts in ONE query.
 *
 * `workout_id = ANY($1::bigint[])` is Postgres for "workout_id is in this
 * array" — it lets us pass a JS array as one parameter. Loading all
 * exercises in one query (instead of one query per workout) avoids the
 * "N+1 queries" performance problem.
 *
 * (The old "no workoutIds = load everything" branch was unused and has been
 * removed.)
 */
async function loadExercises(client: Queryable, workoutIds: number[]): Promise<ExerciseRow[]> {
    // Empty list → nothing to load; skip the round-trip to the database.
    if (workoutIds.length === 0) return [];
    const result = await client.query<ExerciseRow>(
        "SELECT id, workout_id, name, reps, sets, rest_time_minutes, exercise_order FROM exercises WHERE workout_id = ANY($1::bigint[]) ORDER BY exercise_order",
        [workoutIds]
    );
    return result.rows;
}

/** Load one workout + exercises using whichever connection we're given. */
async function loadWorkout(client: Queryable, id: number): Promise<Workout | null> {
    const result = await client.query<WorkoutRow>("SELECT id, name FROM workouts WHERE id = $1", [id]);
    const row = result.rows[0];
    if (!row) return null;
    return toWorkout(row, await loadExercises(client, [id]));
}

export class WorkoutRepository {
    /**
     * Insert a new workout and all its exercises.
     *
     * Uses a TRANSACTION (BEGIN ... COMMIT): either the workout AND every
     * exercise are saved, or — if anything fails — ROLLBACK undoes it all, so
     * you never get a workout with half its exercises.
     *
     * A transaction must run on ONE connection, which is why this borrows a
     * dedicated `client` from the pool instead of using pool.query().
     */
    async create(workout: Workout): Promise<Workout> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            // RETURNING gives us back the generated id without a second query.
            const result = await client.query<WorkoutRow>("INSERT INTO workouts (name) VALUES ($1) RETURNING id, name", [workout.name]);
            const row = result.rows[0];
            if (!row) throw new Error("Workout insert returned no row.");
            const workoutId = Number(row.id);
            // Every exercise is new here, so insert them all at their array positions.
            for (const [index, exercise] of workout.getExercises().entries()) await this.insertExercise(client, workoutId, exercise, index + 1);
            // Re-read inside the same transaction so the returned exercises
            // include their freshly generated ids.
            const saved = await loadWorkout(client, workoutId);
            await client.query("COMMIT");
            if (!saved) throw new Error("Workout disappeared after insert.");
            return saved;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error; // re-throw so the caller still sees the failure
        } finally {
            // ALWAYS give the connection back to the pool, success or failure.
            // Forgetting this would slowly leak all 10 connections.
            client.release();
        }
    }

    /** Every workout (sorted by name, then id), each with its exercises. Two queries total. */
    async findAll(): Promise<Workout[]> {
        const result = await pool.query<WorkoutRow>("SELECT id, name FROM workouts ORDER BY name, id");
        const exercises = await loadExercises(pool, result.rows.map((r) => Number(r.id)));
        return result.rows.map((r) => toWorkout(r, exercises));
    }

    /** One workout with its exercises, or null if the id doesn't exist. */
    async findById(id: number): Promise<Workout | null> {
        return loadWorkout(pool, id);
    }

    /**
     * Replace a workout's name and exercise list (in a transaction).
     * Returns null if no workout has that id.
     *
     * Strategy ("diff" instead of "delete everything"):
     *   1. Rename the workout.
     *   2. Read the ids of the exercises it currently has.
     *   3. For each exercise in the new list:
     *        - has an id that belongs to THIS workout → UPDATE that row
     *        - no id (or an id from some other workout) → INSERT a new row
     *   4. DELETE the old rows whose id wasn't in the new list (the user
     *      removed them).
     * exercise_order is always rewritten from the array position, so
     * reordering in the app just works.
     *
     * Because kept exercises keep their ids, completed_sets rows stay linked
     * to them — the old version broke that link on every edit.
     */
    async update(id: number, workout: Workout): Promise<Workout | null> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<WorkoutRow>("UPDATE workouts SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name", [workout.name, id]);
            if (!result.rows[0]) {
                // No such workout: undo the (empty) transaction and report "not found".
                await client.query("ROLLBACK");
                return null;
            }

            // Step 2: which exercise ids does this workout own right now?
            // A Set gives fast "is this id one of them?" checks.
            const existing = await client.query<{ id: number }>("SELECT id FROM exercises WHERE workout_id = $1", [id]);
            const existingIds = new Set(existing.rows.map((r) => Number(r.id)));
            const keptIds: number[] = [];

            // Step 3: update or insert, in the order the user arranged them.
            for (const [index, exercise] of workout.getExercises().entries()) {
                const order = index + 1;
                if (exercise.id !== undefined && existingIds.has(exercise.id)) {
                    await client.query(
                        "UPDATE exercises SET name = $1, reps = $2, sets = $3, rest_time_minutes = $4, exercise_order = $5 WHERE id = $6",
                        [exercise.name, exercise.reps, exercise.sets, exercise.restTimeMinutes, order, exercise.id]
                    );
                    keptIds.push(exercise.id);
                } else {
                    // An id we don't recognize is treated as a new exercise
                    // rather than trusted — a client can't edit another
                    // workout's exercise by sending its id.
                    // The new row's id goes into keptIds too, otherwise step 4
                    // would delete the exercise we just added.
                    keptIds.push(await this.insertExercise(client, id, exercise, order));
                }
            }

            // Step 4: delete whatever the user removed (every row that is
            // neither kept nor just inserted). `<> ALL(array)` means "not
            // equal to any element of the array".
            await client.query("DELETE FROM exercises WHERE workout_id = $1 AND id <> ALL($2::bigint[])", [id, keptIds]);

            const saved = await loadWorkout(client, id);
            await client.query("COMMIT");
            return saved;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a workout. Its exercises are removed automatically
     * (ON DELETE CASCADE); its session history is kept (ON DELETE SET NULL).
     * Returns true if a row was actually deleted, false if the id didn't exist.
     */
    async delete(id: number): Promise<boolean> {
        const result = await pool.query("DELETE FROM workouts WHERE id = $1", [id]);
        // rowCount can be null for some command types, hence `?? 0`.
        return (result.rowCount ?? 0) > 0;
    }

    /**
     * Insert one exercise row and return its new id.
     * Must be called inside a transaction, with that transaction's client.
     */
    private async insertExercise(client: PoolClient, workoutId: number, exercise: Exercise, order: number): Promise<number> {
        const result = await client.query<{ id: number }>(
            "INSERT INTO exercises (workout_id, name, reps, sets, rest_time_minutes, exercise_order) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
            [workoutId, exercise.name, exercise.reps, exercise.sets, exercise.restTimeMinutes, order]
        );
        const row = result.rows[0];
        if (!row) throw new Error("Exercise insert returned no row.");
        return Number(row.id);
    }
}
