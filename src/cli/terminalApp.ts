import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Exercise } from "../models/Exercise.js";
import { WorkoutSession } from "../models/WorkoutSession.js";
import { WorkoutService, type CreateWorkoutInput } from "../services/WorkoutService.js";
import { SessionService } from "../services/SessionService.js";

export class TerminalApp {
    private readonly workouts = new WorkoutService();
    private readonly sessions = new SessionService();

    async run(): Promise<void> {
        const terminal = readline.createInterface({ input, output });
        try {
            while (true) {
                console.clear();
                console.log("EverythingFitness\n\n1. Create workout\n2. Start workout\n3. Edit workout\n4. Delete workout\n5. View session history\n6. Exit\n");
                const choice = (await terminal.question("Choose an option: ")).trim();
                try {
                    if (choice === "1") await this.create(terminal);
                    else if (choice === "2") await this.start(terminal);
                    else if (choice === "3") await this.edit(terminal);
                    else if (choice === "4") await this.remove(terminal);
                    else if (choice === "5") await this.history(terminal);
                    else if (choice === "6") return;
                    else console.log("Please choose 1 through 6.");
                } catch (error) { console.log(`\nError: ${error instanceof Error ? error.message : String(error)}`); await terminal.question("\nPress Enter to continue."); }
            }
        } finally { terminal.close(); }
    }

    private async create(terminal: readline.Interface): Promise<void> { const input = await this.askWorkout(terminal); const workout = await this.workouts.createWorkout(input); console.log(`\nCreated workout ${workout.id}: ${workout.name}`); await terminal.question("\nPress Enter to continue."); }

    private async start(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts();
        console.log("\nWorkouts:");
        if (workouts.length === 0) { console.log("No workouts found. Create one first."); await terminal.question("\nPress Enter to continue."); return; }
        for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        console.log("0. Back to main menu\n");
        const workoutId = await this.chooseId(terminal, "Enter workout ID: ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return;
        const { id, session } = await this.sessions.startSession(workoutId);
        console.log(`\nSession ${id} started for ${session.getWorkoutName()}.`);
        while (session.getStatus() !== "completed") {
            const exercise = session.getCurrentExercise();
            if (!exercise) throw new Error("The session could not find the next exercise.");
            const setNumber = session.getCurrentSetNumber();
            const weight = await this.number(terminal, `${exercise.name} — set ${setNumber} weight: `, true);
            const reps = await this.number(terminal, `${exercise.name} — set ${setNumber} completed reps: `, false);
            session.recordCompletedSet(weight, reps);
            const completedSet = { sessionId: id, exerciseName: exercise.name, setNumber, weight, reps };
            await this.sessions.recordCompletedSet(exercise.id === undefined ? completedSet : { ...completedSet, exerciseId: exercise.id });
            if (session.getStatus() === "resting") await this.handleRest(terminal, session);
        }
        await this.sessions.completeSession(id);
        console.log("\nWorkout complete.");
        await terminal.question("\nPress Enter to continue.");
    }

    private async handleRest(terminal: readline.Interface, session: WorkoutSession): Promise<void> {
        const controller = new AbortController();
        const frames = ["|", "\\", "-", "/"];
        let frame = 0;
        const spinner = setInterval(() => { process.stdout.write(`\r${frames[frame++ % frames.length]} Resting: ${session.getRemainingRestSeconds()} seconds remaining   `); }, 250);
        process.stdout.write(`\nRest timer started. Press Enter to skip.\n`);
        try {
            const timer = session.waitForRest().then(() => "finished" as const);
            const skip = terminal.question("", { signal: controller.signal }).then(() => "skip" as const).catch(() => "aborted" as const);
            if (await Promise.race([timer, skip]) === "skip" && session.getStatus() === "resting") session.skipRest();
            else controller.abort();
        } finally { clearInterval(spinner); process.stdout.write("\n"); }
    }

    private async edit(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts();
        if (workouts.length === 0) { console.log("No workouts found."); await terminal.question("\nPress Enter to continue."); return; }
        console.log("\nWorkouts:"); for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        const workoutId = await this.chooseId(terminal, "Workout ID (0 to exit): ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return;
        const workout = await this.workouts.getWorkout(workoutId);
        const name = workout.name;
        const exercises = [...workout.getExercises()].map((exercise) => ({ name: exercise.name, reps: exercise.reps, sets: exercise.sets, restTimeMinutes: exercise.restTimeMinutes }));
        while (true) {
            console.clear(); console.log("Which exercise would you like to edit? Or would you like to add an exercise? If you wish to exit enter 0\n");
            exercises.forEach((exercise, index) => console.log(`${index + 1}. ${exercise.name}`));
            console.log("A. Add an exercise\n0. Exit\n");
            const rawChoice = (await terminal.question("Select exercise: ")).trim().toLowerCase();
            const choice = Number(rawChoice);
            if (choice === 0) break;
            if (Number.isInteger(choice) && choice >= 1 && choice <= exercises.length) {
                const exercise = exercises[choice - 1];
                if (exercise) {
                    const updatedExercise = await this.editExercise(terminal, exercise);
                    if (updatedExercise) exercises[choice - 1] = updatedExercise;
                }
            }
            else if (rawChoice === "a") exercises.push(await this.askExercise(terminal));
            else console.log("Please select a listed option.");
        }
        await this.workouts.updateWorkout(workoutId, { name, exercises });
        console.log("Workout updated."); await terminal.question("\nPress Enter to continue.");
    }

    private async remove(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts(); console.log("\nWorkouts:"); for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        const workoutId = await this.chooseId(terminal, "Workout ID (0 to exit): ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return;
        await this.workouts.deleteWorkout(workoutId); console.log("Workout deleted. Existing session history was preserved."); await terminal.question("\nPress Enter to continue.");
    }

    private async history(terminal: readline.Interface): Promise<void> {
        const history = await this.sessions.listHistory();
        if (history.length === 0) { console.log("No completed sessions found."); await terminal.question("\nPress Enter to continue."); return; }
        console.log("\nWorkout history:"); history.forEach((item, index) => console.log(`${index + 1}. ${item.workoutName} : ${item.startedAt.toLocaleString()}`)); console.log("0. Back\n");
        const choice = Number((await terminal.question("Select a session: ")).trim());
        if (choice === 0) return;
        const selected = Number.isInteger(choice) && choice >= 1 && choice <= history.length ? history[choice - 1] : undefined;
        if (!selected) { console.log("Please select a listed session."); await terminal.question("\nPress Enter to continue."); return; }
        const details = await this.sessions.getHistory(selected.id);
        let workout = selected.workoutId === null ? undefined : await this.workouts.getWorkout(selected.workoutId);
        console.log(`\n${details.workoutName} : ${details.startedAt.toLocaleString()}\n`);
        console.log("exercise | weight | rep goal | rep completed | sets");
        for (const set of details.completedSets) { const exercise = workout?.getExercises().find((item) => item.id === set.exerciseId || item.name === set.exerciseName); console.log(`${set.exerciseName} | ${set.weight} | ${exercise?.reps ?? "—"} | ${set.reps} | ${exercise?.sets ?? "—"}`); }
        await terminal.question("\nPress Enter to continue.");
    }

    private async askWorkout(terminal: readline.Interface, name?: string): Promise<CreateWorkoutInput> { const workoutName = name ?? (await terminal.question("Workout name: ")).trim(); const exercises: CreateWorkoutInput["exercises"] = []; while (true) { exercises.push(await this.askExercise(terminal)); if ((await terminal.question("Add another exercise? (y/n): ")).trim().toLowerCase() !== "y") break; } return { name: workoutName, exercises }; }
    private async askExercise(terminal: readline.Interface, existing?: Exercise): Promise<{ name: string; reps: number; sets: number; restTimeMinutes: number }> { const name = (await terminal.question(`Exercise name${existing ? ` [${existing.name}]` : ""}: `)).trim() || existing?.name || ""; const reps = await this.number(terminal, `Reps${existing ? ` [${existing.reps}]` : ""}: `, false, existing?.reps); const sets = await this.number(terminal, `Sets${existing ? ` [${existing.sets}]` : ""}: `, false, existing?.sets); const restTimeMinutes = await this.number(terminal, `Rest time (minutes)${existing ? ` [${existing.restTimeMinutes}]` : ""}: `, false, existing?.restTimeMinutes); return { name, reps, sets, restTimeMinutes }; }
    private async editExercise(terminal: readline.Interface, exercise: { name: string; reps: number; sets: number; restTimeMinutes: number }): Promise<{ name: string; reps: number; sets: number; restTimeMinutes: number } | undefined> {
        while (true) {
            console.clear();
            console.log(`Edit ${exercise.name}\n\n1. Change name\n2. Change Reps\n3. Change Sets\n4. Change Rest Time\n0. Back\n`);
            const choice = (await terminal.question("Choose an option: ")).trim();
            if (choice === "0") return undefined;
            if (choice === "1") {
                const name = (await terminal.question(`New name [${exercise.name}]: `)).trim();
                if (name) return { ...exercise, name };
                console.log("Name cannot be blank.");
            } else if (choice === "2") return { ...exercise, reps: await this.number(terminal, `Reps [${exercise.reps}]: `, false, exercise.reps) };
            else if (choice === "3") return { ...exercise, sets: await this.number(terminal, `Sets [${exercise.sets}]: `, false, exercise.sets) };
            else if (choice === "4") return { ...exercise, restTimeMinutes: await this.number(terminal, `Rest time in minutes [${exercise.restTimeMinutes}]: `, false, exercise.restTimeMinutes) };
            else console.log("Please choose 1, 2, 3, 4, or 0.");
        }
    }
    private async chooseId(terminal: readline.Interface, prompt: string, validIds: number[], allowBack: boolean): Promise<number | undefined> { while (true) { const value = Number((await terminal.question(prompt)).trim()); if (allowBack && value === 0) return undefined; if (Number.isInteger(value) && validIds.includes(value)) return value; console.log("That workout ID was not found. Please try again."); } }
    private async number(terminal: readline.Interface, prompt: string, zeroAllowed: boolean, defaultValue?: number): Promise<number> { while (true) { const raw = (await terminal.question(prompt)).trim(); const value = raw === "" && defaultValue !== undefined ? defaultValue : Number(raw); if (Number.isInteger(value) && (zeroAllowed ? value >= 0 : value > 0)) return value; console.log(zeroAllowed ? "Enter a whole number zero or greater." : "Enter a positive whole number."); } }
}
