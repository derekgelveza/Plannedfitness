import fs from "node:fs/promises";
import path from "node:path";
import { WorkoutService } from "../src/services/WorkoutService.js";

const service = new WorkoutService();
const directory = path.join(process.cwd(), "data", "workouts");
const files = await fs.readdir(directory);
const existing = await service.listWorkouts();
for (const file of files.filter((item) => item.endsWith(".txt"))) {
    try { const data = JSON.parse(await fs.readFile(path.join(directory, file), "utf8")) as { name: string; exercises: Array<{ name: string; reps: number; sets: number; restTimeMinutes: number }> }; if (existing.some((workout) => workout.name === data.name)) { console.log(`Skipped duplicate: ${data.name}`); continue; } const workout = await service.createWorkout(data); console.log(`Migrated ${workout.name} as ${workout.id}.`); } catch (error) { console.error(`Failed ${file}:`, error instanceof Error ? error.message : String(error)); }
}
