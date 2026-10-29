export type ExerciseInput = {
    name: string;
    reps: number;
    sets: number;
    restTimeMinutes: number;
    exerciseOrder?: number;
};

export class Exercise {
    constructor(
        public readonly name: string,
        public readonly reps: number,
        public readonly sets: number,
        public readonly restTimeMinutes: number,
        public readonly id?: number,
        public readonly exerciseOrder?: number
    ) {}
}
