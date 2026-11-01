# EverythingFitness

EverythingFitness is a TypeScript workout tracker backed by PostgreSQL. The terminal client, the Express API and the React Native (Expo) app in `frontend/` share the same backend services and repositories.

```text
Terminal CLI ─┐
              ├── Services ─── Repositories ─── PostgreSQL
Expo app ── API ┘
```

## Setup

1. Install Node.js and PostgreSQL.
2. Create a local database, such as `everything_fitness_dev`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`.
4. Apply `src/database/schema.sql` to the database. (No new migration is needed for the frontend work.)
5. Run `npm install` and `npm run build`.

To import the existing text-file backups once the schema is ready, run `npm run migrate`. The original files are retained.

## Run

Backend (from `Module1/`):

- `npm run build` builds the project. **Re-run it after changing anything in `src/`.**
- `npm start` starts the API on port 3000 (needed by the app).
- `npm run cli` starts the terminal application.

App (from `Module1/frontend/`, in a second terminal):

- `npm install` (first time only)
- `npx expo start` then press `w` for the web browser, or scan the QR code with Expo Go on a phone on the same Wi-Fi.
- The app finds the API automatically (see `frontend/src/api/config.ts`). If it can't, create `frontend/.env` with `EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000` and restart Expo.

## App screens (`frontend/src/app/`)

| File | Wireframe | What it does |
| --- | --- | --- |
| `index.tsx` | Dashboard | Begin in the middle, 8 feature circles. Only Begin and Workouts work; the rest say "coming soon". |
| `workouts/index.tsx` | Workouts | Numbered list. Tap a row to edit, ⊕ to create. |
| `workouts/new.tsx` | Create workout | Tap NAME to rename. Fill the card, press ⊕ to add the exercise, scroll down to see the list. Save in the header. |
| `workouts/[id].tsx` | Edit workout | Same editor. ⋯ menu → Delete. |
| `begin.tsx` | Begin clicked | Workouts on a ring. Drag it like a rotary phone; tap the top circle to start. |
| `session/[id].tsx` | When workout created | Exercises on a ring; the top one is big and shows last time's weight × reps in grey. Tap a number to enter today's, then Log set. |

The dial logic is in `frontend/src/components/rotary-dial.tsx` and the session rules in `frontend/src/lib/session.ts`.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | API process is running |
| GET | `/api/workouts` | List workouts |
| GET | `/api/workouts/:id` | One workout |
| POST | `/api/workouts` | Create `{ name, exercises: [{ name, reps, sets, restTimeMinutes }] }` |
| PUT | `/api/workouts/:id` | Replace. Include each kept exercise's `id` so it keeps its history. |
| DELETE | `/api/workouts/:id` | Delete (session history is kept) |
| GET | `/api/workouts/:id/previous` | **New.** Last time's sets for each exercise |
| POST | `/api/workouts/:id/sessions` | Start a session → `{ sessionId, startedAt }` |
| GET | `/api/sessions` | Session history |
| GET | `/api/sessions/:id` | One session with its sets |
| DELETE | `/api/sessions/:id` | **New.** Discard a session |
| POST | `/api/sessions/:id/sets` | Log a set `{ exerciseId?, exerciseName, setNumber, weight, reps }` |
| POST | `/api/sessions/:id/complete` | Mark finished |

Errors come back as `{ "error": "message" }` with 400 (bad input), 404 (not found), 409 (session already completed) or 500.

Database credentials belong in `.env`, which is excluded from source control.
