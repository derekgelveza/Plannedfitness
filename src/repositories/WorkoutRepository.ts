import type { PoolClient } from "pg";
import { pool } from "../database/connection.js";
import { Exercise } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";

type WorkoutRow = { id: number; name: string };
type ExerciseRow = { id: number; workout_id: number; name: string; reps: number; sets: number; rest_time_minutes: number; exercise_order: number };

function toWorkout(row: WorkoutRow, exercises: ExerciseRow[]): Workout {
    const workoutId = Number(row.id);
    return new Workout(row.name, exercises.filter((e) => Number(e.workout_id) === workoutId).sort((a, b) => a.exercise_order - b.exercise_order).map((e) => new Exercise(e.name, e.reps, e.sets, e.rest_time_minutes, Number(e.id), e.exercise_order)), workoutId);
}
async function loadExercises(client: PoolClient | typeof pool, workoutIds?: number[]): Promise<ExerciseRow[]> {
    if (workoutIds && workoutIds.length === 0) return [];
    const result = workoutIds ? await client.query<ExerciseRow>("SELECT id, workout_id, name, reps, sets, rest_time_minutes, exercise_order FROM exercises WHERE workout_id = ANY($1::bigint[]) ORDER BY exercise_order", [workoutIds]) : await client.query<ExerciseRow>("SELECT id, workout_id, name, reps, sets, rest_time_minutes, exercise_order FROM exercises ORDER BY exercise_order");
    return result.rows;
}

export class WorkoutRepository {
    async create(workout: Workout): Promise<Workout> {
        const client = await pool.connect();
        try { await client.query("BEGIN"); const result = await client.query<WorkoutRow>("INSERT INTO workouts (name) VALUES ($1) RETURNING id, name", [workout.name]); const row = result.rows[0]; if (!row) throw new Error("Workout insert returned no row."); const workoutId = Number(row.id); await this.insertExercises(client, workoutId, workout); await client.query("COMMIT"); return new Workout(row.name, [...workout.getExercises()].map((e, i) => new Exercise(e.name, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1)), workoutId); }
        catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    }
    async findAll(): Promise<Workout[]> { const result = await pool.query<WorkoutRow>("SELECT id, name FROM workouts ORDER BY name, id"); const exercises = await loadExercises(pool, result.rows.map((r) => r.id)); return result.rows.map((r) => toWorkout(r, exercises)); }
    async findById(id: number): Promise<Workout | null> { const result = await pool.query<WorkoutRow>("SELECT id, name FROM workouts WHERE id = $1", [id]); const row = result.rows[0]; if (!row) return null; return toWorkout(row, await loadExercises(pool, [id])); }
    async update(id: number, workout: Workout): Promise<Workout | null> {
        const client = await pool.connect();
        try { await client.query("BEGIN"); const result = await client.query<WorkoutRow>("UPDATE workouts SET name = $1, updated_at = NOW() WHERE id = $2 RETURNING id, name", [workout.name, id]); const row = result.rows[0]; if (!row) { await client.query("ROLLBACK"); return null; } const workoutId = Number(row.id); await client.query("DELETE FROM exercises WHERE workout_id = $1", [id]); await this.insertExercises(client, workoutId, workout); await client.query("COMMIT"); return new Workout(row.name, [...workout.getExercises()].map((e, i) => new Exercise(e.name, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1)), workoutId); }
        catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
    }
    async delete(id: number): Promise<boolean> { const result = await pool.query("DELETE FROM workouts WHERE id = $1", [id]); return (result.rowCount ?? 0) > 0; }
    private async insertExercises(client: PoolClient, workoutId: number, workout: Workout): Promise<void> { for (const [index, exercise] of workout.getExercises().entries()) await client.query("INSERT INTO exercises (workout_id, name, reps, sets, rest_time_minutes, exercise_order) VALUES ($1, $2, $3, $4, $5, $6)", [workoutId, exercise.name, exercise.reps, exercise.sets, exercise.restTimeMinutes, index + 1]); }
}
