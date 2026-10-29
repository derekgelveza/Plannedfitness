import { Exercise, type ExerciseInput } from "../models/Exercise.js";
import { Workout } from "../models/Workout.js";
import { WorkoutRepository } from "../repositories/WorkoutRepository.js";

export type CreateWorkoutInput = { name: string; exercises: ExerciseInput[] };
export type UpdateWorkoutInput = CreateWorkoutInput;

export class WorkoutService {
    constructor(private readonly repository = new WorkoutRepository()) {}
    async createWorkout(input: CreateWorkoutInput): Promise<Workout> { return this.repository.create(this.toWorkout(input)); }
    async listWorkouts(): Promise<Workout[]> { return this.repository.findAll(); }
    async getWorkout(id: number): Promise<Workout> { this.assertId(id); const workout = await this.repository.findById(id); if (!workout) throw new Error("Workout not found."); return workout; }
    async updateWorkout(id: number, input: UpdateWorkoutInput): Promise<Workout> { this.assertId(id); const workout = await this.repository.update(id, this.toWorkout(input)); if (!workout) throw new Error("Workout not found."); return workout; }
    async deleteWorkout(id: number): Promise<void> { this.assertId(id); if (!(await this.repository.delete(id))) throw new Error("Workout not found."); }
    private toWorkout(input: CreateWorkoutInput): Workout { const name = input.name?.trim(); if (!name) throw new Error("Workout name must not be blank."); if (!Array.isArray(input.exercises) || input.exercises.length === 0) throw new Error("A workout must have at least one exercise."); return new Workout(name, input.exercises.map((e, i) => { const exerciseName = e.name?.trim(); if (!exerciseName) throw new Error("Exercise names must not be blank."); for (const [label, value] of [["reps", e.reps], ["sets", e.sets], ["rest time", e.restTimeMinutes]] as const) if (!Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer.`); return new Exercise(exerciseName, e.reps, e.sets, e.restTimeMinutes, undefined, i + 1); })); }
    private assertId(id: number): void { if (!Number.isInteger(id) || id <= 0) throw new Error("ID must be a positive integer."); }
}
