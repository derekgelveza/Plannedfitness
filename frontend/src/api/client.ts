/**
 * api/client.ts — Every call the app makes to the backend lives here.
 *
 * Screens never call fetch() directly; they call these functions
 * (e.g. `await api.listWorkouts()`). Keeping all URLs in one file means a
 * backend route change only needs fixing in one place.
 *
 * Errors: if the server answers with an error status, the backend sends
 * `{ "error": "Workout name must not be blank." }`. request() turns that into
 * a thrown ApiError carrying the message, so screens can show it directly.
 * If the server can't be reached at all, a friendlier "Can't reach the
 * server" message is thrown instead of the browser's cryptic one.
 */
import { API_URL } from './config';
import type { CompletedSetInput, PreviousPerformance, StartedSession, Workout, WorkoutInput } from './types';

/** An error that came back from the backend (or from not reaching it). */
export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Low-level helper used by every function below.
 * @param path   e.g. "/api/workouts/3"
 * @param method HTTP method (default GET)
 * @param body   object to send as JSON (optional)
 * @returns the parsed JSON response, or undefined for empty responses (201/204)
 */
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      // Only send a Content-Type when there IS a body. (A JSON content type on
      // a GET would make browsers send an extra CORS preflight for nothing.)
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // fetch() only throws when the request never got an answer
    // (server not running, wrong IP, phone on a different Wi-Fi...).
    throw new ApiError(`Can't reach the server at ${API_URL}. Is the backend running (npm start in Module1)?`, 0);
  }

  // 201 from POST /sets and 204 from DELETE/complete have no body.
  const text = await response.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const message = data && typeof data.error === 'string' ? data.error : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

/**
 * The API, grouped as one object so screens can write `api.getWorkout(id)`.
 * Each function's comment names the backend route it calls.
 */
export const api = {
  /** GET /api/workouts — every workout with its exercises. */
  listWorkouts: () => request<Workout[]>('/api/workouts'),

  /** GET /api/workouts/:id */
  getWorkout: (id: number) => request<Workout>(`/api/workouts/${id}`),

  /** POST /api/workouts — returns the saved workout (with new ids). */
  createWorkout: (input: WorkoutInput) => request<Workout>('/api/workouts', 'POST', input),

  /** PUT /api/workouts/:id — full replacement; include exercise ids to keep history. */
  updateWorkout: (id: number, input: WorkoutInput) => request<Workout>(`/api/workouts/${id}`, 'PUT', input),

  /** DELETE /api/workouts/:id — past sessions are kept on the server. */
  deleteWorkout: (id: number) => request<void>(`/api/workouts/${id}`, 'DELETE'),

  /** GET /api/workouts/:id/previous — last time's sets for each exercise. */
  getPrevious: (workoutId: number) => request<PreviousPerformance[]>(`/api/workouts/${workoutId}/previous`),

  /** POST /api/workouts/:id/sessions — creates a session row, returns its id. */
  startSession: (workoutId: number) => request<StartedSession>(`/api/workouts/${workoutId}/sessions`, 'POST'),

  /** POST /api/sessions/:id/sets — log one finished set. */
  logSet: (sessionId: number, set: CompletedSetInput) => request<void>(`/api/sessions/${sessionId}/sets`, 'POST', set),

  /** POST /api/sessions/:id/complete — stamp the finish time. */
  completeSession: (sessionId: number) => request<void>(`/api/sessions/${sessionId}/complete`, 'POST'),

  /** DELETE /api/sessions/:id — throw the session (and its sets) away. */
  discardSession: (sessionId: number) => request<void>(`/api/sessions/${sessionId}`, 'DELETE'),
};

/** Turn anything caught in a try/catch into a message you can show the user. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
