export class CompletedSet {
    public readonly completedAt: Date;

    constructor(
        public readonly exerciseName: string,
        public readonly setNumber: number,
        public readonly weight: number,
        public readonly reps: number,
        completedAt: Date = new Date(),
        public readonly exerciseId?: number
    ) { this.completedAt = completedAt; }
}

export type CompletedSetInput = {
    sessionId: number;
    exerciseId?: number;
    exerciseName: string;
    setNumber: number;
    weight: number;
    reps: number;
    completedAt?: Date;
};
