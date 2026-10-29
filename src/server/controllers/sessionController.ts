/**
 * server/controllers/sessionController.ts — HTTP handlers for sessions.
 * Same thin-controller approach as workoutController.ts.
 */
import type { Request, Response } from "express";
import { SessionService } from "../../services/SessionService.js";

const service = new SessionService();

// Read ":id" from the URL as a number (NaN if not numeric).
const id = (request: Request): number => Number(request.params.id);

// GET /api/sessions → 200 + list of session summaries.
export async function listSessions(_request: Request, response: Response): Promise<void> { response.json(await service.listHistory()); }

// GET /api/sessions/:id → 200 + session with its sets, or 404.
export async function getSession(request: Request, response: Response): Promise<void> { response.json(await service.getHistory(id(request))); }

// POST /api/workouts/:id/sessions → 201 + { sessionId, startedAt }.
// Note: here ":id" is the WORKOUT id (this route is mounted under workouts).
// The client must keep sessionId to log sets and complete the session.
export async function startSession(request: Request, response: Response): Promise<void> { const result = await service.startSession(Number(request.params.id)); response.status(201).json({ sessionId: result.id, startedAt: result.session.getStartedAt() }); }

// POST /api/sessions/:id/sets → 201 (empty body).
// Body fields are spread in, then sessionId is set from the URL. Because
// sessionId comes last it wins, so a client can't override it via the body.
export async function addSet(request: Request, response: Response): Promise<void> { await service.recordCompletedSet({ ...request.body, sessionId: id(request) }); response.status(201).send(); }

// POST /api/sessions/:id/complete → 204 No Content, or 404.
export async function completeSession(request: Request, response: Response): Promise<void> { await service.completeSession(id(request)); response.status(204).send(); }
