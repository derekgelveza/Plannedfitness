import { Exercise } from "./Exercise.js";

export class Workout {
    private readonly exercises: Exercise[];

    constructor(
        public readonly name: string,
        exercises: Exercise[] = [],
        public readonly id?: number
    ) {
        this.exercises = [...exercises];
    }

    addExercise(exercise: Exercise): void { this.exercises.push(exercise); }
    getExercises(): readonly Exercise[] { return this.exercises; }
}
