/**
 * server/controllers/sessionController.ts — HTTP handlers for sessions.
 * Same thin-controller approach as workoutController.ts.
 */
import type { Request, Response } from "express";
import { SessionService } from "../../services/SessionService.js";

const service = new SessionService();

// Read ":id" from the URL as a number (NaN if not numeric → 400 from the service).
const id = (request: Request): number => Number(request.params.id);

// GET /api/sessions → 200 + list of session summaries.
export async function listSessions(_request: Request, response: Response): Promise<void> { response.json(await service.listHistory()); }

// GET /api/sessions/:id → 200 + session with its sets, or 404.
export async function getSession(request: Request, response: Response): Promise<void> { response.json(await service.getHistory(id(request))); }

// POST /api/workouts/:id/sessions → 201 + { sessionId, startedAt }.
// Note: here ":id" is the WORKOUT id (this route is mounted under workouts).
// The client must keep sessionId to log sets and complete the session.
export async function startSession(request: Request, response: Response): Promise<void> { const result = await service.startSession(id(request)); response.status(201).json({ sessionId: result.id, startedAt: result.session.getStartedAt() }); }

// GET /api/workouts/:id/previous[?excludeSession=12] → 200 + PreviousPerformance[].
// NEW: feeds the greyed-out "last time" numbers in the app's session screen.
// ":id" is the WORKOUT id. excludeSession is optional (defaults to 0 = none).
export async function getPrevious(request: Request, response: Response): Promise<void> {
    const exclude = request.query.excludeSession === undefined ? 0 : Number(request.query.excludeSession);
    response.json(await service.getPreviousPerformance(id(request), exclude));
}

// POST /api/sessions/:id/sets → 201 (empty body).
// Body: { exerciseName, setNumber, weight, reps, exerciseId? }.
// sessionId is taken from the URL and placed LAST so a client can't override
// it via the body. The service also strips any other unexpected fields.
export async function addSet(request: Request, response: Response): Promise<void> { await service.recordCompletedSet({ ...(request.body ?? {}), sessionId: id(request) }); response.status(201).send(); }

// POST /api/sessions/:id/complete → 204 No Content, or 404.
export async function completeSession(request: Request, response: Response): Promise<void> { await service.completeSession(id(request)); response.status(204).send(); }

// DELETE /api/sessions/:id → 204, or 404. NEW: used by "Discard workout".
export async function discardSession(request: Request, response: Response): Promise<void> { await service.discardSession(id(request)); response.status(204).send(); }
