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
 */
import type { PoolClient } from "pg";
import { pool } from "../database/connection.js";
import { Exercise } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";

/** Shape of a row from `SELECT id, name FROM workouts`. */
type WorkoutRow = { id: number; name: string };

/** Shape of a row from the `exercises` table (snake_case, like the columns). */
type ExerciseRow = { id: number; workout_id: number; name: string; reps: number; sets: number; rest_time_minutes: number; exercise_order: number };

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
 * Load exercise rows, either for specific workouts or (if `workoutIds` is
 * omitted) for every workout.
 *
 * `client` can be the pool or a single borrowed connection, since both have
 * a .query() method.
 *
 * `workout_id = ANY($1::bigint[])` is Postgres for "workout_id is in this
 * array" — it lets us pass a JS array as one parameter. Loading all
 * exercises in one query (instead of one query per workout) avoids the
 * "N+1 queries" performance problem.
 *
 * REVIEW NOTE: the "no workoutIds" branch isn't used by anything right now.
 */
async function loadExercises(client: PoolClient | typeof pool, workoutIds?: number[]): Promise<ExerciseRow[]> {
    // Empty list → nothing to load; skip the round-trip to the database.
    if (workoutIds && workoutIds.length === 0) return [];
    const result = workoutIds
        ? await client.query<ExerciseRow>("SELECT id, workout_id, name, reps, sets, rest_time_minutes, exercise_order FROM exercises WHERE workout_id = ANY($1::bigint[]) ORDER BY exercise_order", [workoutIds])
        : await client.query<ExerciseRow>("SELECT id, workout_id, name, reps, sets, rest_time_minutes, exercise_order FROM exercises ORDER BY exercise_order");
    return result.rows;
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
            await this.insertExercises(client, workoutId, workout);
            await client.query("COMMIT");
            // Build the result from what we sent rather than re-reading the DB.
            // REVIEW NOTE: the returned exercises have id = undefined (their new
            // database ids aren't fetched). Call findById() if you need them.
            return new Workout(row.name, [...workout.getExercises()].map((e, i) => new Exercise(e.name, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1)), workoutId);
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
        const exercises = await loadExercises(pool, result.rows.map((r) => r.id));
        return result.rows.map((r) => toWorkout(r, exercises));
    }

    /** One workout with its exercises, or null if the id doesn't exist. */
    async findById(id: number): Promise<Workout | null> {
        const result = await pool.query<WorkoutRow>("SELECT id, name FROM workouts WHERE id = $1", [id]);
        const row = result.rows[0];
        if (!row) return null;
        return toWorkout(row, await loadExercises(pool, [id]));
    }

    /**
     * Replace a workout's name and its whole exercise list (in a transaction).
     * Returns null if no workout has that id.
     *
     * Strategy: rather than figuring out which exercises changed, it DELETES
     * all of the workout's exercises and INSERTS the new list.
     *
     * REVIEW NOTE: because exercises are deleted and recreated, they get NEW
     * ids every time a workout is edited. Due to `ON DELETE SET NULL` in the
     * schema, every past completed_sets row for this workout loses its
     * exercise_id link. History still has exercise_name, and the terminal
     * app falls back to matching by name, so it mostly works — but if you
     * rename an exercise, old history can no longer be matched to it.
     */
    async update(id: number, workout: Workout): Promise<Workout | null> {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");
            const result = await client.query<WorkoutRow>("UPDATE workouts SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name", [workout.name, id]);
            const row = result.rows[0];
            if (!row) {
                // No such workout: undo the (empty) transaction and report "not found".
                await client.query("ROLLBACK");
                return null;
            }
            const workoutId = Number(row.id);
            await client.query("DELETE FROM exercises WHERE workout_id = $1", [id]);
            await this.insertExercises(client, workoutId, workout);
            await client.query("COMMIT");
            // Same as create(): returned exercises don't carry their new ids.
            return new Workout(row.name, [...workout.getExercises()].map((e, i) => new Exercise(e.name, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1)), workoutId);
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
     * Insert each exercise of `workout`, one INSERT per exercise.
     * exercise_order is taken from the exercise's position in the array
     * (index 0 → order 1), not from any exerciseOrder value on the object.
     * Must be called inside a transaction, with that transaction's client.
     */
    private async insertExercises(client: PoolClient, workoutId: number, workout: Workout): Promise<void> {
        // .entries() yields [index, value] pairs.
        for (const [index, exercise] of workout.getExercises().entries())
            await client.query("INSERT INTO exercises (workout_id, name, reps, sets, rest_time_minutes, exercise_order) VALUES ($1, $2, $3, $4, $5, $6)", [workoutId, exercise.name, exercise.reps, exercise.sets, exercise.restTimeMinutes, index + 1]);
    }
}
