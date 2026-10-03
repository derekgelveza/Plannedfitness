const readline = require("node:readline") as typeof import("node:readline");
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
type SessionStatus = "not-started" | "active" | "resting" | "completed";
type WorkoutProgress = [completedSets: number, totalSets: number, percentage: number];

class Exercise {
    public readonly name: string;
    public readonly reps: number;
    public readonly sets: number;
    public readonly restTimeMinutes: number;

    constructor(name: string, reps: number, sets: number, restTimeMinutes: number) {
        this.name = name;
        this.reps = reps;
        this.sets = sets;
        this.restTimeMinutes = restTimeMinutes;
    }
}

class Workout {
    public readonly name: string;
    private exercises: Exercise[] = [];

    constructor(name: string) {
        this.name = name;
    }

    addExercise(exercise: Exercise): void {
        this.exercises.push(exercise);
    }

    getExercises(): readonly Exercise[] {
        return this.exercises;
    }

    toJSON(): object {
        return { name: this.name, exercises: this.exercises };
    }

    static fromJSON(data: { name: string; exercises: Exercise[] }): Workout {
        const workout = new Workout(data.name);

        for (const exercise of data.exercises) {
            workout.addExercise(
                new Exercise(
                    exercise.name,
                    exercise.reps,
                    exercise.sets,
                    exercise.restTimeMinutes
                )
            );
        }

        return workout;
    }
}

class CompletedSet {
    public readonly exerciseName: string;
    public readonly setNumber: number;
    public readonly weight: number;
    public readonly reps: number;
    public readonly completedAt: Date;

    constructor(
        exerciseName: string,
        setNumber: number,
        weight: number,
        reps: number
    ) {
        this.exerciseName = exerciseName;
        this.setNumber = setNumber;
        this.weight = weight;
        this.reps = reps;
        this.completedAt = new Date();
    }
}

class WorkoutSession {
    private readonly completedSets: CompletedSet[] = [];
    private currentExerciseIndex = 0;
    private currentSetNumber = 1;
    private restEndsAt: Date | undefined;
    private restTimer: NodeJS.Timeout | undefined;
    private status: SessionStatus = "not-started";
    private startedAt: Date | undefined;
    private completedAt: Date | undefined;

    constructor(private readonly workout: Workout) {}

    start(): void {
        if (this.status !== "not-started") {
            throw new Error("This workout session has already started.");
        }

        if (this.workout.getExercises().length === 0) {
            throw new Error("A workout must have at least one exercise.");
        }

        this.status = "active";
        this.startedAt = new Date();
    }

    getCurrentExercise(): Exercise | undefined {
        return this.workout.getExercises()[this.currentExerciseIndex];
    }

    getCurrentSetNumber(): number {
        return this.currentSetNumber;
    }

    getStatus(): SessionStatus {
        return this.status;
    }

    getCompletedSets(): readonly CompletedSet[] {
        return this.completedSets;
    }

    getProgress(): WorkoutProgress {
        const totalSets = this.workout
            .getExercises()
            .reduce((total, exercise) => total + exercise.sets, 0);
        const completedSets = this.completedSets.length;
        const percentage = totalSets === 0 ? 0 : (completedSets / totalSets) * 100;

        return [completedSets, totalSets, percentage];
    }

    getStartedAt(): Date | undefined {
        return this.startedAt;
    }

    getCompletedAt(): Date | undefined {
        return this.completedAt;
    }

    getWorkoutName(): string {
        return this.workout.name;
    }

    getRemainingRestSeconds(): number {
        if (this.restEndsAt === undefined) {
            return 0;
        }

        const millisecondsRemaining = this.restEndsAt.getTime() - Date.now();
        return Math.max(0, Math.ceil(millisecondsRemaining / 1000));
    }

    recordCompletedSet(weight: number, reps: number): void {
        if (this.status !== "active") {
            throw new Error("You can only record a set while the session is active.");
        }

        const exercise = this.getCurrentExercise();

        if (exercise === undefined) {
            throw new Error("There is no exercise left in this workout.");
        }

        this.completedSets.push(
            new CompletedSet(exercise.name, this.currentSetNumber, weight, reps)
        );

        if (this.isFinalSet()) {
            this.finish();
            return;
        }

        this.startRest(exercise.restTimeMinutes);
    }

    private isFinalSet(): boolean {
        const exercise = this.getCurrentExercise();
        const isFinalSetForExercise =
            exercise !== undefined && this.currentSetNumber === exercise.sets;
        const isFinalExercise =
            this.currentExerciseIndex === this.workout.getExercises().length - 1;

        return isFinalSetForExercise && isFinalExercise;
    }

    private startRest(restTimeMinutes: number): void {
        this.status = "resting";
        this.restEndsAt = new Date(Date.now() + restTimeMinutes * 60_000);

        this.restTimer = setTimeout(() => {
            this.finishRest();
        }, restTimeMinutes * 60_000);
    }

    waitForRest(): Promise<void> {
        if (this.status !== "resting") {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const checkRestStatus = setInterval(() => {
                if (this.status !== "resting") {
                    clearInterval(checkRestStatus);
                    resolve();
                }
            }, 100);
        });
    }

    skipRest(): void {
        if (this.status !== "resting") {
            throw new Error("There is no rest timer to skip.");
        }

        if (this.restTimer !== undefined) {
            clearTimeout(this.restTimer);
        }

        this.finishRest();
    }

    private finishRest(): void {
        if (this.status !== "resting") {
            return;
        }

        this.restTimer = undefined;
        this.restEndsAt = undefined;
        this.advanceToNextSet();
        this.status = "active";
    }

    private advanceToNextSet(): void {
        const exercise = this.getCurrentExercise();

        if (exercise !== undefined && this.currentSetNumber < exercise.sets) {
            this.currentSetNumber += 1;
            return;
        }

        this.currentExerciseIndex += 1;
        this.currentSetNumber = 1;
    }

    private finish(): void {
        if (this.restTimer !== undefined) {
            clearTimeout(this.restTimer);
        }

        this.restTimer = undefined;
        this.restEndsAt = undefined;
        this.status = "completed";
        this.completedAt = new Date();
    }
}

class Main {
    private workouts: Workout[] = [];
    private readonly workoutDirectory = path.join(process.cwd(), "data", "workouts");
    private readonly sessionDirectory = path.join(process.cwd(), "data", "sessions");

    async run(): Promise<void> {
        const terminal = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        const question = (prompt: string): Promise<string> =>
            new Promise((resolve) => terminal.question(prompt, resolve));
        const questionWithSignal = (
            prompt: string,
            signal: AbortSignal
        ): Promise<string> =>
            new Promise((resolve) => terminal.question(prompt, { signal }, resolve));

        while (true) {
            console.clear();
            console.log("Welcome to EverythingFitness!\n");
            console.log("1. Create workout");
            console.log("2. Start workout");
            console.log("3. Exit\n");

            const choice = (await question("Choose an option: ")).trim();

            if (choice === "1") {
                await this.createWorkout(question);
            } else if (choice === "2") {
                await this.startWorkout(question, questionWithSignal);
            }else if (choice === "3") {
                console.log("Have a good day!");
                process.exit(0);
            } else {
                console.log("\nPlease choose 1, 2, or 3.");
                await question("\nPress Enter to try again.");
            }
        }
    }

    private async createWorkout(
        question: (prompt: string) => Promise<string>
    ): Promise<void> {
        console.clear();
        console.log(
            'Create your own workouts. Start with giving it a name, such as "push", "upper", or "lower". Then input your exercise, reps, sets, time to rest (in minutes).\n'
        );

        const workoutName = await this.askForText(question, "Workout name: ");
        const workout = new Workout(workoutName);
        let addAnotherExercise = true;

        while (addAnotherExercise) {
            const exerciseName = await this.askForText(question, "Exercise: ");
            const reps = await this.askForPositiveNumber(question, "Reps: ");
            const sets = await this.askForPositiveNumber(question, "Sets: ");
            const restTimeMinutes = await this.askForPositiveNumber(
                question,
                "Time to rest (minutes): "
            );

            workout.addExercise(
                new Exercise(exerciseName, reps, sets, restTimeMinutes)
            );

            addAnotherExercise = await this.askYesOrNo(
                question,
                "\nAdd another exercise? (yes/no): "
            );
        }

        this.workouts.push(workout);
        const filePath = this.saveWorkout(workout);
        console.log(`\n${workout.name} was saved as ${path.basename(filePath)}.`);
        await question("\nPress Enter to return to the main menu.");
    }

    private async startWorkout(
        question: (prompt: string) => Promise<string>,
        questionWithSignal: (prompt: string, signal: AbortSignal) => Promise<string>
    ): Promise<void> {
        const savedWorkouts = this.loadWorkouts();

        console.clear();
        console.log("Saved workouts:\n");

        if (savedWorkouts.length === 0) {
            console.log("No saved workouts found. Create a workout first.");
            await question("\nPress Enter to return to the main menu.");
            return;
        }

        savedWorkouts.forEach((workout, index) => {
            console.log(`${index + 1}. ${workout.name}`);
        });
        console.log("0. Exit\n");

        const selectedWorkout = await this.selectWorkout(question, savedWorkouts);

        if (selectedWorkout === undefined) {
            return;
        }

        const session = new WorkoutSession(selectedWorkout);
        session.start();
        await this.runWorkoutSession(session, question, questionWithSignal);

        const filePath = this.saveSession(session);
        console.log(`\nWorkout complete. Session saved as ${path.basename(filePath)}.`);
        await question("\nPress Enter to return to the main menu.");
    }

    private async selectWorkout(
        question: (prompt: string) => Promise<string>,
        workouts: Workout[]
    ): Promise<Workout | undefined> {
        while (true) {
            const choice = Number((await question("Select a workout: ")).trim());

            if (choice === 0) {
                return undefined;
            }

            if (Number.isInteger(choice) && choice >= 1 && choice <= workouts.length) {
                return workouts[choice - 1];
            }

            console.log("Please select a listed workout number or 0 to exit.");
        }
    }

    private async runWorkoutSession(
        session: WorkoutSession,
        question: (prompt: string) => Promise<string>,
        questionWithSignal: (prompt: string, signal: AbortSignal) => Promise<string>
    ): Promise<void> {
        while (session.getStatus() !== "completed") {
            const exercise = session.getCurrentExercise();

            if (exercise === undefined) {
                throw new Error("The session could not find the next exercise.");
            }

            console.clear();
            console.log(`${session.getWorkoutName()}\n`);
            console.log(`${exercise.name} — Set ${session.getCurrentSetNumber()} of ${exercise.sets}`);
            console.log(`Planned reps: ${exercise.reps}`);

            const [completedSets, totalSets, percentage] = session.getProgress();
            console.log(`Overall progress: ${completedSets}/${totalSets} sets (${percentage.toFixed(0)}%)`);

            const weight = await this.askForNonNegativeNumber(question, "Weight: ");
            const reps = await this.askForPositiveNumber(question, "Completed reps: ");
            session.recordCompletedSet(weight, reps);

            if (session.getStatus() === "resting") {
                await this.handleRest(session, questionWithSignal);
            }
        }
    }

    private async handleRest(
        session: WorkoutSession,
        questionWithSignal: (prompt: string, signal: AbortSignal) => Promise<string>
    ): Promise<void> {
        console.log(
            `\nRest timer started for ${session.getRemainingRestSeconds()} seconds. Press Enter to skip it.`
        );

        const controller = new AbortController();
        const restComplete = session.waitForRest().then(() => "timer-finished");
        const userResponse = questionWithSignal("", controller.signal).then(
            (answer) => ({ type: "user-response", answer: answer.trim() })
        );
        const spinner = this.startRestSpinner(session);

        try {
            const result = await Promise.race([restComplete, userResponse]);

            if (typeof result === "string") {
                controller.abort();
                console.log("Rest complete.");
                return;
            }

            if (result.answer === "") {
                session.skipRest();
                console.log("Rest skipped.");
                return;
            }

            console.log("Rest timer will continue.");
            await session.waitForRest();
            console.log("Rest complete.");
        } finally {
            clearInterval(spinner);
            process.stdout.write("\n");
        }
    }

    private startRestSpinner(session: WorkoutSession): NodeJS.Timeout {
        const frames = ["\\", "|", "-", "/"];
        let frameIndex = 0;

        const displayFrame = (): void => {
            const frame = frames[frameIndex] ?? "-";
            const seconds = session.getRemainingRestSeconds();

            process.stdout.write(`\r${frame} Resting: ${seconds} seconds remaining   `);
            frameIndex = (frameIndex + 1) % frames.length;
        };

        displayFrame();
        return setInterval(displayFrame, 250);
    }

    private saveWorkout(workout: Workout): string {
        fs.mkdirSync(this.workoutDirectory, { recursive: true });
        const fileName = `${this.toSafeFileName(workout.name)}.txt`;
        const filePath = path.join(this.workoutDirectory, fileName);

        fs.writeFileSync(filePath, JSON.stringify(workout.toJSON(), null, 2));
        return filePath;
    }

    private loadWorkouts(): Workout[] {
        if (!fs.existsSync(this.workoutDirectory)) {
            return [];
        }

        const workouts: Workout[] = [];
        const files = fs.readdirSync(this.workoutDirectory).filter(
            (file) => path.extname(file).toLowerCase() === ".txt"
        );

        for (const file of files) {
            try {
                const filePath = path.join(this.workoutDirectory, file);
                const data = JSON.parse(fs.readFileSync(filePath, "utf8")) as {
                    name: string;
                    exercises: Exercise[];
                };
                workouts.push(Workout.fromJSON(data));
            } catch {
                console.log(`Could not load ${file}.`);
            }
        }

        return workouts;
    }

    private saveSession(session: WorkoutSession): string {
        fs.mkdirSync(this.sessionDirectory, { recursive: true });
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        const fileName = `${this.toSafeFileName(session.getWorkoutName())}-${timestamp}.txt`;
        const filePath = path.join(this.sessionDirectory, fileName);

        fs.writeFileSync(
            filePath,
            JSON.stringify(
                {
                    workoutName: session.getWorkoutName(),
                    startedAt: session.getStartedAt(),
                    completedAt: session.getCompletedAt(),
                    completedSets: session.getCompletedSets()
                },
                null,
                2
            )
        );

        return filePath;
    }

    private toSafeFileName(name: string): string {
        return name.replace(/[^a-z0-9-_ ]/gi, "_").trim() || "workout";
    }

    private async askForText(
        question: (prompt: string) => Promise<string>,
        prompt: string
    ): Promise<string> {
        while (true) {
            const answer = (await question(prompt)).trim();

            if (answer !== "") {
                return answer;
            }

            console.log("Please enter a value.");
        }
    }

    private async askForPositiveNumber(
        question: (prompt: string) => Promise<string>,
        prompt: string
    ): Promise<number> {
        while (true) {
            const answer = Number((await question(prompt)).trim());

            if (Number.isFinite(answer) && answer > 0) {
                return answer;
            }

            console.log("Please enter a number greater than 0.");
        }
    }

    private async askForNonNegativeNumber(
        question: (prompt: string) => Promise<string>,
        prompt: string
    ): Promise<number> {
        while (true) {
            const answer = Number((await question(prompt)).trim());

            if (Number.isFinite(answer) && answer >= 0) {
                return answer;
            }

            console.log("Please enter a number that is zero or greater.");
        }
    }

    private async askYesOrNo(
        question: (prompt: string) => Promise<string>,
        prompt: string
    ): Promise<boolean> {
        while (true) {
            const answer = (await question(prompt)).trim().toLowerCase();

            if (answer === "yes" || answer === "y") {
                return true;
            }

            if (answer === "no" || answer === "n") {
                return false;
            }

            console.log("Please answer yes or no.");
        }
    }
}

const main = new Main();
main.run();
