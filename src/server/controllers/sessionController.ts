import type { Request, Response } from "express";
import { SessionService } from "../../services/SessionService.js";
const service = new SessionService();
const id = (request: Request): number => Number(request.params.id);
export async function listSessions(_request: Request, response: Response): Promise<void> { response.json(await service.listHistory()); }
export async function getSession(request: Request, response: Response): Promise<void> { response.json(await service.getHistory(id(request))); }
export async function startSession(request: Request, response: Response): Promise<void> { const result = await service.startSession(Number(request.params.id)); response.status(201).json({ sessionId: result.id, startedAt: result.session.getStartedAt() }); }
export async function addSet(request: Request, response: Response): Promise<void> { await service.recordCompletedSet({ ...request.body, sessionId: id(request) }); response.status(201).send(); }
export async function completeSession(request: Request, response: Response): Promise<void> { await service.completeSession(id(request)); response.status(204).send(); }
