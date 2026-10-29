import { Router } from "express";
import { addSet, completeSession, getSession, listSessions } from "../controllers/sessionController.js";
export const sessionRoutes = Router();
sessionRoutes.get("/", listSessions); sessionRoutes.get("/:id", getSession); sessionRoutes.post("/:id/sets", addSet); sessionRoutes.post("/:id/complete", completeSession);
