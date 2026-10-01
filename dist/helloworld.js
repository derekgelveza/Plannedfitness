"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
class Exercise {
    constructor(name, reps, sets, restTimeMinutes) {
        this.name = name;
        this.reps = reps;
        this.sets = sets;
        this.restTimeMinutes = restTimeMinutes;
    }
}
class Workout {
    constructor(name) {
        this.exercises = [];
        this.name = name;
    }
    addExercise(exercise) {
        this.exercises.push(exercise);
    }
    getExercises() {
        return this.exercises;
    }
    toJSON() {
        return { name: this.name, exercises: this.exercises };
    }
    static fromJSON(data) {
        const workout = new Workout(data.name);
        for (const exercise of data.exercises) {
            workout.addExercise(new Exercise(exercise.name, exercise.reps, exercise.sets, exercise.restTimeMinutes));
        }
        return workout;
    }
}
class CompletedSet {
    constructor(exerciseName, setNumber, weight, reps) {
        this.exerciseName = exerciseName;
        this.setNumber = setNumber;
        this.weight = weight;
        this.reps = reps;
        this.completedAt = new Date();
    }
}
class WorkoutSession {
    constructor(workout) {
        this.workout = workout;
        this.completedSets = [];
        this.currentExerciseIndex = 0;
        this.currentSetNumber = 1;
        this.status = "not-started";
    }
    start() {
        if (this.status !== "not-started") {
            throw new Error("This workout session has already started.");
        }
        if (this.workout.getExercises().length === 0) {
            throw new Error("A workout must have at least one exercise.");
        }
        this.status = "active";
        this.startedAt = new Date();
    }
    getCurrentExercise() {
        return this.workout.getExercises()[this.currentExerciseIndex];
    }
    getCurrentSetNumber() {
        return this.currentSetNumber;
    }
    getStatus() {
        return this.status;
    }
    getCompletedSets() {
        return this.completedSets;
    }
    getStartedAt() {
        return this.startedAt;
    }
    getCompletedAt() {
        return this.completedAt;
    }
    getWorkoutName() {
        return this.workout.name;
    }
    getRemainingRestSeconds() {
        if (this.restEndsAt === undefined) {
            return 0;
        }
        const millisecondsRemaining = this.restEndsAt.getTime() - Date.now();
        return Math.max(0, Math.ceil(millisecondsRemaining / 1000));
    }
    recordCompletedSet(weight, reps) {
        if (this.status !== "active") {
            throw new Error("You can only record a set while the session is active.");
        }
        const exercise = this.getCurrentExercise();
        if (exercise === undefined) {
            throw new Error("There is no exercise left in this workout.");
        }
        this.completedSets.push(new CompletedSet(exercise.name, this.currentSetNumber, weight, reps));
        if (this.isFinalSet()) {
            this.finish();
            return;
        }
        this.startRest(exercise.restTimeMinutes);
    }
    isFinalSet() {
        const exercise = this.getCurrentExercise();
        const isFinalSetForExercise = exercise !== undefined && this.currentSetNumber === exercise.sets;
        const isFinalExercise = this.currentExerciseIndex === this.workout.getExercises().length - 1;
        return isFinalSetForExercise && isFinalExercise;
    }
    startRest(restTimeMinutes) {
        this.status = "resting";
        this.restEndsAt = new Date(Date.now() + restTimeMinutes * 60000);
        this.restTimer = setTimeout(() => {
            this.finishRest();
        }, restTimeMinutes * 60000);
    }
    waitForRest() {
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
    skipRest() {
        if (this.status !== "resting") {
            throw new Error("There is no rest timer to skip.");
        }
        if (this.restTimer !== undefined) {
            clearTimeout(this.restTimer);
        }
        this.finishRest();
    }
    finishRest() {
        if (this.status !== "resting") {
            return;
        }
        this.restTimer = undefined;
        this.restEndsAt = undefined;
        this.advanceToNextSet();
        this.status = "active";
    }
    advanceToNextSet() {
        const exercise = this.getCurrentExercise();
        if (exercise !== undefined && this.currentSetNumber < exercise.sets) {
            this.currentSetNumber += 1;
            return;
        }
        this.currentExerciseIndex += 1;
        this.currentSetNumber = 1;
    }
    finish() {
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
    constructor() {
        this.workouts = [];
        this.workoutDirectory = path.join(process.cwd(), "data", "workouts");
        this.sessionDirectory = path.join(process.cwd(), "data", "sessions");
    }
    run() {
        return __awaiter(this, void 0, void 0, function* () {
            const terminal = readline.createInterface({
                input: process.stdin,
                output: process.stdout
            });
            const question = (prompt) => new Promise((resolve) => terminal.question(prompt, resolve));
            const questionWithSignal = (prompt, signal) => new Promise((resolve) => terminal.question(prompt, { signal }, resolve));
            while (true) {
                console.clear();
                console.log("Welcome to EverythingFitness!\n");
                console.log("1. Create workout");
                console.log("2. Start workout");
                console.log("3. Exit\n");
                const choice = (yield question("Choose an option: ")).trim();
                if (choice === "1") {
                    yield this.createWorkout(question);
                }
                else if (choice === "2") {
                    yield this.startWorkout(question, questionWithSignal);
                }
                else if (choice === "3") {
                    console.log("Have a good day!");
                    process.exit(0);
                }
                else {
                    console.log("\nPlease choose 1, 2, or 3.");
                    yield question("\nPress Enter to try again.");
                }
            }
        });
    }
    createWorkout(question) {
        return __awaiter(this, void 0, void 0, function* () {
            console.clear();
            console.log('Create your own workouts. Start with giving it a name, such as "push", "upper", or "lower". Then input your exercise, reps, sets, time to rest (in minutes).\n');
            const workoutName = yield this.askForText(question, "Workout name: ");
            const workout = new Workout(workoutName);
            let addAnotherExercise = true;
            while (addAnotherExercise) {
                const exerciseName = yield this.askForText(question, "Exercise: ");
                const reps = yield this.askForPositiveNumber(question, "Reps: ");
                const sets = yield this.askForPositiveNumber(question, "Sets: ");
                const restTimeMinutes = yield this.askForPositiveNumber(question, "Time to rest (minutes): ");
                workout.addExercise(new Exercise(exerciseName, reps, sets, restTimeMinutes));
                addAnotherExercise = yield this.askYesOrNo(question, "\nAdd another exercise? (yes/no): ");
            }
            this.workouts.push(workout);
            const filePath = this.saveWorkout(workout);
            console.log(`\n${workout.name} was saved as ${path.basename(filePath)}.`);
            yield question("\nPress Enter to return to the main menu.");
        });
    }
    startWorkout(question, questionWithSignal) {
        return __awaiter(this, void 0, void 0, function* () {
            const savedWorkouts = this.loadWorkouts();
            console.clear();
            console.log("Saved workouts:\n");
            if (savedWorkouts.length === 0) {
                console.log("No saved workouts found. Create a workout first.");
                yield question("\nPress Enter to return to the main menu.");
                return;
            }
            savedWorkouts.forEach((workout, index) => {
                console.log(`${index + 1}. ${workout.name}`);
            });
            console.log("0. Exit\n");
            const selectedWorkout = yield this.selectWorkout(question, savedWorkouts);
            if (selectedWorkout === undefined) {
                return;
            }
            const session = new WorkoutSession(selectedWorkout);
            session.start();
            yield this.runWorkoutSession(session, question, questionWithSignal);
            const filePath = this.saveSession(session);
            console.log(`\nWorkout complete. Session saved as ${path.basename(filePath)}.`);
            yield question("\nPress Enter to return to the main menu.");
        });
    }
    selectWorkout(question, workouts) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const choice = Number((yield question("Select a workout: ")).trim());
                if (choice === 0) {
                    return undefined;
                }
                if (Number.isInteger(choice) && choice >= 1 && choice <= workouts.length) {
                    return workouts[choice - 1];
                }
                console.log("Please select a listed workout number or 0 to exit.");
            }
        });
    }
    runWorkoutSession(session, question, questionWithSignal) {
        return __awaiter(this, void 0, void 0, function* () {
            while (session.getStatus() !== "completed") {
                const exercise = session.getCurrentExercise();
                if (exercise === undefined) {
                    throw new Error("The session could not find the next exercise.");
                }
                console.clear();
                console.log(`${session.getWorkoutName()}\n`);
                console.log(`${exercise.name} — Set ${session.getCurrentSetNumber()} of ${exercise.sets}`);
                console.log(`Planned reps: ${exercise.reps}`);
                const weight = yield this.askForNonNegativeNumber(question, "Weight: ");
                const reps = yield this.askForPositiveNumber(question, "Completed reps: ");
                session.recordCompletedSet(weight, reps);
                if (session.getStatus() === "resting") {
                    yield this.handleRest(session, questionWithSignal);
                }
            }
        });
    }
    handleRest(session, questionWithSignal) {
        return __awaiter(this, void 0, void 0, function* () {
            console.log(`\nRest timer started for ${session.getRemainingRestSeconds()} seconds. Press Enter to skip it.`);
            const controller = new AbortController();
            const restComplete = session.waitForRest().then(() => "timer-finished");
            const userResponse = questionWithSignal("", controller.signal).then((answer) => ({ type: "user-response", answer: answer.trim() }));
            const spinner = this.startRestSpinner(session);
            try {
                const result = yield Promise.race([restComplete, userResponse]);
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
                yield session.waitForRest();
                console.log("Rest complete.");
            }
            finally {
                clearInterval(spinner);
                process.stdout.write("\n");
            }
        });
    }
    startRestSpinner(session) {
        const frames = ["\\", "|", "-", "/"];
        let frameIndex = 0;
        const displayFrame = () => {
            var _a;
            const frame = (_a = frames[frameIndex]) !== null && _a !== void 0 ? _a : "-";
            const seconds = session.getRemainingRestSeconds();
            process.stdout.write(`\r${frame} Resting: ${seconds} seconds remaining   `);
            frameIndex = (frameIndex + 1) % frames.length;
        };
        displayFrame();
        return setInterval(displayFrame, 250);
    }
    saveWorkout(workout) {
        fs.mkdirSync(this.workoutDirectory, { recursive: true });
        const fileName = `${this.toSafeFileName(workout.name)}.txt`;
        const filePath = path.join(this.workoutDirectory, fileName);
        fs.writeFileSync(filePath, JSON.stringify(workout.toJSON(), null, 2));
        return filePath;
    }
    loadWorkouts() {
        if (!fs.existsSync(this.workoutDirectory)) {
            return [];
        }
        const workouts = [];
        const files = fs.readdirSync(this.workoutDirectory).filter((file) => path.extname(file).toLowerCase() === ".txt");
        for (const file of files) {
            try {
                const filePath = path.join(this.workoutDirectory, file);
                const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
                workouts.push(Workout.fromJSON(data));
            }
            catch (_a) {
                console.log(`Could not load ${file}.`);
            }
        }
        return workouts;
    }
    saveSession(session) {
        fs.mkdirSync(this.sessionDirectory, { recursive: true });
        const timestamp = new Date().toISOString().replace(/:/g, "-");
        const fileName = `${this.toSafeFileName(session.getWorkoutName())}-${timestamp}.txt`;
        const filePath = path.join(this.sessionDirectory, fileName);
        fs.writeFileSync(filePath, JSON.stringify({
            workoutName: session.getWorkoutName(),
            startedAt: session.getStartedAt(),
            completedAt: session.getCompletedAt(),
            completedSets: session.getCompletedSets()
        }, null, 2));
        return filePath;
    }
    toSafeFileName(name) {
        return name.replace(/[^a-z0-9-_ ]/gi, "_").trim() || "workout";
    }
    askForText(question, prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const answer = (yield question(prompt)).trim();
                if (answer !== "") {
                    return answer;
                }
                console.log("Please enter a value.");
            }
        });
    }
    askForPositiveNumber(question, prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const answer = Number((yield question(prompt)).trim());
                if (Number.isFinite(answer) && answer > 0) {
                    return answer;
                }
                console.log("Please enter a number greater than 0.");
            }
        });
    }
    askForNonNegativeNumber(question, prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const answer = Number((yield question(prompt)).trim());
                if (Number.isFinite(answer) && answer >= 0) {
                    return answer;
                }
                console.log("Please enter a number that is zero or greater.");
            }
        });
    }
    askYesOrNo(question, prompt) {
        return __awaiter(this, void 0, void 0, function* () {
            while (true) {
                const answer = (yield question(prompt)).trim().toLowerCase();
                if (answer === "yes" || answer === "y") {
                    return true;
                }
                if (answer === "no" || answer === "n") {
                    return false;
                }
                console.log("Please answer yes or no.");
            }
        });
    }
}
const main = new Main();
main.run();
//# sourceMappingURL=helloworld.js.map