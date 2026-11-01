/**
 * cli/terminalApp.ts — The interactive terminal (command-line) version of
 * EverythingFitness. It shows a numbered menu, asks questions with readline,
 * and uses the SAME services as the REST API, so both front-ends share the
 * same validation and database.
 *
 * Main menu → method:
 *   1 Create workout   → create()
 *   2 Start workout    → start()  (runs a live session with rest timers)
 *   3 Edit workout     → edit()
 *   4 Delete workout   → remove()
 *   5 Session history  → history()
 *   6 Exit
 *
 * REVIEW NOTE: how this is launched. package.json's "cli" script runs
 * dist/helloworld.js, which does `new TerminalApp().run()`. But there is no
 * src/helloworld.ts in the project, so that compiled file is a leftover: if
 * dist/ is ever cleaned and rebuilt, `npm run cli` will stop working. Adding
 * a small src/cli.ts (or restoring helloworld.ts) would fix that.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { Exercise } from "../models/Exercise.js";
import { WorkoutSession } from "../models/WorkoutSession.js";
import { WorkoutService, type CreateWorkoutInput } from "../services/WorkoutService.js";
import { SessionService } from "../services/SessionService.js";

export class TerminalApp {
    private readonly workouts = new WorkoutService();
    private readonly sessions = new SessionService();

    /**
     * Main loop: show the menu, run the chosen action, repeat until "6".
     * The inner try/catch means an error in any action (e.g. a validation
     * message from a service) is printed and the app returns to the menu
     * instead of crashing. The outer finally always closes readline so the
     * process can exit.
     */
    async run(): Promise<void> {
        // readline/promises: terminal.question() returns a Promise of what the user typed.
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
                    // REVIEW NOTE: this message is cleared right away by console.clear()
                    // at the top of the loop, so the user never actually sees it.
                    else console.log("Please choose 1 through 6.");
                } catch (error) { console.log(`\nError: ${error instanceof Error ? error.message : String(error)}`); await terminal.question("\nPress Enter to continue."); }
            }
        } finally { terminal.close(); }
    }

    /** Menu 1: ask for a workout (name + exercises) and save it. */
    private async create(terminal: readline.Interface): Promise<void> { const input = await this.askWorkout(terminal); const workout = await this.workouts.createWorkout(input); console.log(`\nCreated workout ${workout.id}: ${workout.name}`); await terminal.question("\nPress Enter to continue."); }

    /**
     * Menu 2: pick a workout and run a live session.
     * For each set: ask weight and reps, record it both in memory
     * (WorkoutSession, which advances set/exercise and starts the rest timer)
     * and in the database (SessionService), then handle the rest period.
     * Loops until the in-memory session says it's "completed", then marks
     * the session complete in the database.
     */
    private async start(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts();
        console.log("\nWorkouts:");
        if (workouts.length === 0) { console.log("No workouts found. Create one first."); await terminal.question("\nPress Enter to continue."); return; }
        for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        console.log("0. Back to main menu\n");
        // The filter with `id is number` is a TYPE GUARD: it removes undefined
        // ids and tells TypeScript the result is number[] (not (number | undefined)[]).
        const workoutId = await this.chooseId(terminal, "Enter workout ID: ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return; // user chose 0 = back
        const { id, session } = await this.sessions.startSession(workoutId);
        console.log(`\nSession ${id} started for ${session.getWorkoutName()}.`);
        while (session.getStatus() !== "completed") {
            const exercise = session.getCurrentExercise();
            if (!exercise) throw new Error("The session could not find the next exercise.");
            const setNumber = session.getCurrentSetNumber();
            const weight = await this.number(terminal, `${exercise.name} — set ${setNumber} weight: `, true);   // 0 allowed (bodyweight)
            const reps = await this.number(terminal, `${exercise.name} — set ${setNumber} completed reps: `, false);
            // Update in-memory state first (this may switch status to "resting" or "completed")...
            session.recordCompletedSet(weight, reps);
            // ...then persist the set. exerciseId is only included when known,
            // because tsconfig's exactOptionalPropertyTypes forbids passing
            // `exerciseId: undefined` explicitly.
            const completedSet = { sessionId: id, exerciseName: exercise.name, setNumber, weight, reps };
            await this.sessions.recordCompletedSet(exercise.id === undefined ? completedSet : { ...completedSet, exerciseId: exercise.id });
            if (session.getStatus() === "resting") await this.handleRest(terminal, session);
        }
        await this.sessions.completeSession(id);
        console.log("\nWorkout complete.");
        await terminal.question("\nPress Enter to continue.");
        // REVIEW NOTE: weight is read with Number.isInteger, so the CLI can't
        // log decimal weights like 22.5 even though the database supports them.
        // Also, if the user quits mid-workout, the session stays with
        // completed_at = NULL.
    }

    /**
     * Show a spinning countdown while resting, and let the user press Enter
     * to skip. Two things race against each other:
     *   - `timer`: resolves when the rest timer runs out (waitForRest()).
     *   - `skip`:  resolves when the user presses Enter.
     * Promise.race takes whichever finishes first.
     *   - If Enter won, call skipRest() to end the rest now.
     *   - If the timer won, abort the pending question() via the
     *     AbortController so it stops waiting for Enter. (Aborting makes that
     *     promise reject, which the .catch turns into "aborted" so it's harmless.)
     */
    private async handleRest(terminal: readline.Interface, session: WorkoutSession): Promise<void> {
        const controller = new AbortController();
        const frames = ["|", "\\", "-", "/"]; // spinner animation frames
        let frame = 0;
        // Every 250 ms, redraw the same line. "\r" moves the cursor back to the
        // start of the line; trailing spaces erase leftover characters.
        const spinner = setInterval(() => { process.stdout.write(`\r${frames[frame++ % frames.length]} Resting: ${session.getRemainingRestSeconds()} seconds remaining   `); }, 250);
        process.stdout.write(`\nRest timer started. Press Enter to skip.\n`);
        try {
            const timer = session.waitForRest().then(() => "finished" as const);
            const skip = terminal.question("", { signal: controller.signal }).then(() => "skip" as const).catch(() => "aborted" as const);
            // The status check guards against the timer having ended in the same instant.
            if (await Promise.race([timer, skip]) === "skip" && session.getStatus() === "resting") session.skipRest();
            else controller.abort();
        } finally { clearInterval(spinner); process.stdout.write("\n"); } // always stop the spinner
    }

    /**
     * Menu 3: pick a workout, then edit/add exercises in a loop. Changes are
     * made to a local copy (`exercises`) and saved all at once with
     * updateWorkout() when the user enters 0.
     */
    private async edit(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts();
        if (workouts.length === 0) { console.log("No workouts found."); await terminal.question("\nPress Enter to continue."); return; }
        console.log("\nWorkouts:"); for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        const workoutId = await this.chooseId(terminal, "Workout ID (0 to exit): ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return;
        const workout = await this.workouts.getWorkout(workoutId);
        const name = workout.name; // the workout name can't be changed from this screen
        // Copy exercises into plain editable objects (Exercise instances are readonly).
        // The id is carried along (when there is one) so updateWorkout() edits
        // the existing rows instead of replacing them, which keeps each
        // exercise linked to its past sets. editExercise() returns
        // `{ ...exercise, field }`, so the id survives edits too.
        const exercises = [...workout.getExercises()].map((exercise) => ({ ...(exercise.id !== undefined ? { id: exercise.id } : {}), name: exercise.name, reps: exercise.reps, sets: exercise.sets, restTimeMinutes: exercise.restTimeMinutes }));
        while (true) {
            console.clear(); console.log("Which exercise would you like to edit? Or would you like to add an exercise? If you wish to exit enter 0\n");
            exercises.forEach((exercise, index) => console.log(`${index + 1}. ${exercise.name}`));
            console.log("A. Add an exercise\n0. Exit\n");
            const rawChoice = (await terminal.question("Select exercise: ")).trim().toLowerCase();
            const choice = Number(rawChoice); // "a" → NaN, handled below
            // REVIEW NOTE: Number("") is 0, so just pressing Enter here also
            // counts as "0. Exit" and saves.
            if (choice === 0) break;
            if (Number.isInteger(choice) && choice >= 1 && choice <= exercises.length) {
                const exercise = exercises[choice - 1];
                if (exercise) { // always true here; needed because noUncheckedIndexedAccess types array[i] as possibly undefined
                    const updatedExercise = await this.editExercise(terminal, exercise);
                    if (updatedExercise) exercises[choice - 1] = updatedExercise; // undefined = user chose "Back"
                }
            }
            else if (rawChoice === "a") exercises.push(await this.askExercise(terminal));
            // REVIEW NOTE: this message is cleared immediately by console.clear() on the next loop.
            else console.log("Please select a listed option.");
        }
        // Saves even if nothing changed. There's no way to remove an exercise here.
        await this.workouts.updateWorkout(workoutId, { name, exercises });
        console.log("Workout updated."); await terminal.question("\nPress Enter to continue.");
    }

    /**
     * Menu 4: pick a workout and delete it. Past sessions are kept thanks to
     * ON DELETE SET NULL in the schema.
     * REVIEW NOTE: no "are you sure?" confirmation, and if there are no
     * workouts it still asks for an ID (only 0 will get you out).
     */
    private async remove(terminal: readline.Interface): Promise<void> {
        const workouts = await this.workouts.listWorkouts(); console.log("\nWorkouts:"); for (const workout of workouts) console.log(`${workout.id}. ${workout.name}`);
        const workoutId = await this.chooseId(terminal, "Workout ID (0 to exit): ", workouts.map((workout) => workout.id).filter((id): id is number => id !== undefined), true);
        if (workoutId === undefined) return;
        await this.workouts.deleteWorkout(workoutId); console.log("Workout deleted. Existing session history was preserved."); await terminal.question("\nPress Enter to continue.");
    }

    /**
     * Menu 5: list past sessions (numbered 1..n by position, not by database
     * id), let the user pick one, and print its sets as a table.
     *
     * The "rep goal" and "sets" columns come from the CURRENT workout
     * template, matched by exercise id or, failing that, by name. If the
     * workout was deleted (workoutId null) or the exercise can't be matched,
     * those columns show "—". They reflect today's template, not what the
     * goal was on the day of the session.
     */
    private async history(terminal: readline.Interface): Promise<void> {
        const history = await this.sessions.listHistory();
        // REVIEW NOTE: listHistory() includes unfinished sessions too, so
        // "completed" in this message isn't quite accurate.
        if (history.length === 0) { console.log("No completed sessions found."); await terminal.question("\nPress Enter to continue."); return; }
        console.log("\nWorkout history:"); history.forEach((item, index) => console.log(`${index + 1}. ${item.workoutName} : ${item.startedAt.toLocaleString()}`)); console.log("0. Back\n");
        const choice = Number((await terminal.question("Select a session: ")).trim());
        if (choice === 0) return;
        // Convert the 1-based menu number into the array item (undefined if out of range).
        const selected = Number.isInteger(choice) && choice >= 1 && choice <= history.length ? history[choice - 1] : undefined;
        if (!selected) { console.log("Please select a listed session."); await terminal.question("\nPress Enter to continue."); return; }
        const details = await this.sessions.getHistory(selected.id);
        // Load the template (if it still exists) to show goal reps/sets. (`let` could be `const`; it's never reassigned.)
        let workout = selected.workoutId === null ? undefined : await this.workouts.getWorkout(selected.workoutId);
        console.log(`\n${details.workoutName} : ${details.startedAt.toLocaleString()}\n`);
        console.log("exercise | weight | rep goal | rep completed | sets");
        // `?.` and `??`: if workout or exercise is undefined, fall back to "—".
        for (const set of details.completedSets) { const exercise = workout?.getExercises().find((item) => item.id === set.exerciseId || item.name === set.exerciseName); console.log(`${set.exerciseName} | ${set.weight} | ${exercise?.reps ?? "—"} | ${set.reps} | ${exercise?.sets ?? "—"}`); }
        await terminal.question("\nPress Enter to continue.");
    }

    // ---- Input helpers ------------------------------------------------------

    /**
     * Ask for a workout name, then keep asking for exercises until the user
     * answers anything other than "y".
     * REVIEW NOTE: the optional `name` parameter is never passed by any caller.
     * The workout name also isn't checked here; a blank name is rejected later
     * by WorkoutService, after all exercises have been typed in.
     */
    private async askWorkout(terminal: readline.Interface, name?: string): Promise<CreateWorkoutInput> { const workoutName = name ?? (await terminal.question("Workout name: ")).trim(); const exercises: CreateWorkoutInput["exercises"] = []; while (true) { exercises.push(await this.askExercise(terminal)); if ((await terminal.question("Add another exercise? (y/n): ")).trim().toLowerCase() !== "y") break; } return { name: workoutName, exercises }; }

    /**
     * Ask for one exercise's name, reps, sets and rest time.
     * If `existing` is given, each prompt shows the current value in [brackets]
     * and pressing Enter keeps it.
     * REVIEW NOTE: no caller currently passes `existing` (editing uses
     * editExercise() instead), so that default-value behavior is unused.
     */
    private async askExercise(terminal: readline.Interface, existing?: Exercise): Promise<{ name: string; reps: number; sets: number; restTimeMinutes: number }> { const name = (await terminal.question(`Exercise name${existing ? ` [${existing.name}]` : ""}: `)).trim() || existing?.name || ""; const reps = await this.number(terminal, `Reps${existing ? ` [${existing.reps}]` : ""}: `, false, existing?.reps); const sets = await this.number(terminal, `Sets${existing ? ` [${existing.sets}]` : ""}: `, false, existing?.sets); const restTimeMinutes = await this.number(terminal, `Rest time (minutes)${existing ? ` [${existing.restTimeMinutes}]` : ""}: `, false, existing?.restTimeMinutes); return { name, reps, sets, restTimeMinutes }; }

    /**
     * Sub-menu to change ONE field of an exercise. Returns a new object with
     * that field changed (using `{ ...exercise, field: newValue }`), or
     * undefined if the user picks 0 (Back). Only one change per visit; the
     * user returns to the exercise list afterwards.
     */
    private async editExercise(terminal: readline.Interface, exercise: { name: string; reps: number; sets: number; restTimeMinutes: number }): Promise<{ name: string; reps: number; sets: number; restTimeMinutes: number } | undefined> {
        while (true) {
            console.clear();
            console.log(`Edit ${exercise.name}\n\n1. Change name\n2. Change Reps\n3. Change Sets\n4. Change Rest Time\n0. Back\n`);
            const choice = (await terminal.question("Choose an option: ")).trim();
            if (choice === "0") return undefined;
            if (choice === "1") {
                const name = (await terminal.question(`New name [${exercise.name}]: `)).trim();
                if (name) return { ...exercise, name };
                // REVIEW NOTE: this and the message below get wiped by console.clear() on the next loop.
                console.log("Name cannot be blank.");
            } else if (choice === "2") return { ...exercise, reps: await this.number(terminal, `Reps [${exercise.reps}]: `, false, exercise.reps) };
            else if (choice === "3") return { ...exercise, sets: await this.number(terminal, `Sets [${exercise.sets}]: `, false, exercise.sets) };
            else if (choice === "4") return { ...exercise, restTimeMinutes: await this.number(terminal, `Rest time in minutes [${exercise.restTimeMinutes}]: `, false, exercise.restTimeMinutes) };
            else console.log("Please choose 1, 2, 3, 4, or 0.");
        }
    }

    /**
     * Keep asking until the user types one of `validIds` (or 0 for "back"
     * when allowBack is true, which returns undefined).
     * Note: an empty answer counts as 0, since Number("") === 0.
     */
    private async chooseId(terminal: readline.Interface, prompt: string, validIds: number[], allowBack: boolean): Promise<number | undefined> { while (true) { const value = Number((await terminal.question(prompt)).trim()); if (allowBack && value === 0) return undefined; if (Number.isInteger(value) && validIds.includes(value)) return value; console.log("That workout ID was not found. Please try again."); } }

    /**
     * Keep asking until the user types a whole number.
     *   zeroAllowed  true → 0 or more (weights), false → 1 or more (reps, sets, rest).
     *   defaultValue used when the user just presses Enter.
     * Without a default, an empty answer becomes Number("") = 0, which is
     * accepted when zeroAllowed is true (so Enter on a weight prompt logs 0).
     */
    private async number(terminal: readline.Interface, prompt: string, zeroAllowed: boolean, defaultValue?: number): Promise<number> { while (true) { const raw = (await terminal.question(prompt)).trim(); const value = raw === "" && defaultValue !== undefined ? defaultValue : Number(raw); if (Number.isInteger(value) && (zeroAllowed ? value >= 0 : value > 0)) return value; console.log(zeroAllowed ? "Enter a whole number zero or greater." : "Enter a positive whole number."); } }
}
