/**
 * errors.ts — Custom error types used by the service layer.
 *
 * WHY THIS FILE EXISTS (new for the frontend work):
 * The API used to decide the HTTP status code by searching the error MESSAGE
 * for words like "not found" or "must". That was fragile — e.g. the /ID/i
 * regex also matched "invalid" or "provided", so an internal error could be
 * reported to the app as a 400.
 *
 * Now services throw one of these classes instead, and the error handler in
 * server/api.ts checks the CLASS (`error instanceof NotFoundError`). The
 * messages stay human-readable so the terminal app can still print them and
 * the React Native app can show them to the user.
 */

/** Something the caller sent is invalid (blank name, negative reps, ...). → HTTP 400 */
export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        // `name` shows up in stack traces / console.log, which helps debugging.
        this.name = "ValidationError";
    }
}

/** The requested workout/session doesn't exist. → HTTP 404 */
export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotFoundError";
    }
}

/**
 * The request is valid but conflicts with the current state, e.g. logging a
 * set on a session that has already been completed. → HTTP 409
 */
export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "ConflictError";
    }
}
