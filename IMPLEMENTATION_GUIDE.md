# Workout Database and API Implementation Guide

## Goal

Expand the current terminal-based workout application so that workouts and completed workout sessions are stored in PostgreSQL instead of text files.

The terminal application should continue working first. After the backend is stable, expose the same functionality through an HTTP API so a future React Native application can use it.

The final architecture should look like this:

```text
Terminal CLI ─┐
              ├── Services ─── Repositories ─── PostgreSQL
React Native ─┘       ▲
                      │
                 API controllers
```

The React Native application must not connect directly to PostgreSQL. Database credentials and SQL queries belong on the backend server.

## Current application

The current implementation is in `src/helloworld.ts`.

Important existing behavior:

- `Workout` contains a name and a list of `Exercise` objects.
- `WorkoutSession` manages the active workout, rest timer, completed sets, and progress.
- `saveWorkout()` writes workout JSON files to `data/workouts`.
- `loadWorkouts()` reads workout JSON files from `data/workouts`.
- `saveSession()` writes completed session JSON files to `data/sessions`.
- The terminal menu currently supports creating a workout, starting a workout, and exiting.

Do not rewrite the workout timer logic unnecessarily. Move persistence and user-interface responsibilities into separate modules while preserving the existing behavior.

## Target project structure

Refactor the project toward this structure:

```text
src/
  models/
    Workout.ts
    Exercise.ts
    WorkoutSession.ts
    CompletedSet.ts

  database/
    connection.ts
    schema.sql
    migrations/

  repositories/
    WorkoutRepository.ts
    SessionRepository.ts

  services/
    WorkoutService.ts
    SessionService.ts

  cli/
    terminalApp.ts

  server/
    api.ts
    routes/
      workoutRoutes.ts
      sessionRoutes.ts
    controllers/
      workoutController.ts
      sessionController.ts

  main.ts
```

The folders have these responsibilities:

### `models`

TypeScript representations of application data and domain behavior. Models should not contain PostgreSQL queries.

### `database`

PostgreSQL connection setup, schema definitions, migrations, and transaction helpers. This folder answers technical questions such as how to connect to the database and what tables exist.

### `repositories`

SQL queries and conversion between PostgreSQL rows and TypeScript models. Repositories are the boundary between the services and the database.

### `services`

Business logic and validation. Examples include rejecting an empty workout, checking that exercise values are positive, coordinating a workout session, and calculating summaries.

### `cli`

Terminal prompts, menu choices, and printed output. The CLI should call services or the API; it should not contain SQL.

### `server`

HTTP application setup, routes, and controllers. `api.ts` starts/configures the server. Controllers translate HTTP requests into service calls and service results into HTTP responses.

## Database design

Use relational tables instead of storing the entire workout as one JSON column. This will make editing workouts, viewing history, and generating summaries easier.

Create these tables:

```sql
CREATE TABLE workouts (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE exercises (
    id BIGSERIAL PRIMARY KEY,
    workout_id BIGINT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    reps INTEGER NOT NULL CHECK (reps > 0),
    sets INTEGER NOT NULL CHECK (sets > 0),
    rest_time_minutes INTEGER NOT NULL CHECK (rest_time_minutes > 0),
    exercise_order INTEGER NOT NULL CHECK (exercise_order > 0)
);

CREATE TABLE workout_sessions (
    id BIGSERIAL PRIMARY KEY,
    workout_id BIGINT NOT NULL REFERENCES workouts(id),
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ
);

CREATE TABLE completed_sets (
    id BIGSERIAL PRIMARY KEY,
    session_id BIGINT NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id BIGINT REFERENCES exercises(id),
    exercise_name TEXT NOT NULL,
    set_number INTEGER NOT NULL CHECK (set_number > 0),
    weight NUMERIC(10, 2) NOT NULL CHECK (weight >= 0),
    reps INTEGER NOT NULL CHECK (reps > 0),
    completed_at TIMESTAMPTZ NOT NULL
);
```

Keep `exercise_name` in `completed_sets` as a historical snapshot. If a workout is later renamed or edited, old session history should still show what exercise was completed at that time.

## Phase 1: Prepare the project

1. Confirm that Node.js, TypeScript, and PostgreSQL are installed.
2. Create a PostgreSQL database for local development, such as `everything_fitness_dev`.
3. Add the PostgreSQL driver and development tools:

   ```bash
   npm install pg dotenv express
   npm install -D @types/express
   ```

4. Add a `.env` file locally:

   ```text
   DATABASE_URL=postgresql://username:password@localhost:5432/everything_fitness_dev
   PORT=3000
   ```

5. Add `.env` to `.gitignore`. Never commit database passwords.
6. Add a script for compiling and running the project, if one does not already exist.

## Phase 2: Create the database layer

Create `src/database/connection.ts` with a PostgreSQL connection pool.

The database module should:

- Load environment variables.
- Create one shared connection pool.
- Export the pool for repositories.
- Log or throw a clear error if the database cannot be reached.
- Close the pool cleanly when the application exits.

Create `src/database/schema.sql` containing the tables above. Run the schema against the development database and verify the tables exist.

Do not put workout business rules in the database connection file.

## Phase 3: Refactor the models

Move the existing classes out of `helloworld.ts` without changing their behavior.

Add database IDs where needed:

```ts
type Workout = {
  id?: number;
  name: string;
  exercises: Exercise[];
};

type Exercise = {
  id?: number;
  name: string;
  reps: number;
  sets: number;
  restTimeMinutes: number;
  exerciseOrder?: number;
};
```

The ID may be optional when creating a new object because PostgreSQL generates it. It should be present after the object is saved.

Preserve the existing `WorkoutSession` behavior, including:

- Session status.
- Current exercise and set.
- Rest timer.
- Completed sets.
- Started and completed timestamps.

## Phase 4: Implement repositories

Create a `WorkoutRepository` with these methods:

```ts
create(workout: Workout): Promise<Workout>;
findAll(): Promise<Workout[]>;
findById(id: number): Promise<Workout | null>;
update(id: number, workout: Workout): Promise<Workout | null>;
delete(id: number): Promise<boolean>;
```

Important implementation requirements:

- Use parameterized SQL queries. Never build SQL by concatenating user input.
- Use a database transaction when creating or updating a workout and its exercises.
- Insert the workout first, then insert its exercises using the generated workout ID.
- Use `exercise_order` to preserve the order entered in the terminal.
- Load exercises when loading a workout.
- Use `ON DELETE CASCADE` behavior carefully and test it.

Create a `SessionRepository` with methods such as:

```ts
createSession(workoutId: number, startedAt: Date): Promise<number>;
addCompletedSet(input: CompletedSetInput): Promise<void>;
completeSession(sessionId: number, completedAt: Date): Promise<void>;
findAll(): Promise<WorkoutSessionSummary[]>;
findById(id: number): Promise<WorkoutSessionDetails | null>;
```

The repository should be the only layer that knows table names and SQL statements.

## Phase 5: Implement services

Create `WorkoutService` methods for:

```ts
createWorkout(input: CreateWorkoutInput): Promise<Workout>;
listWorkouts(): Promise<Workout[]>;
getWorkout(id: number): Promise<Workout>;
updateWorkout(id: number, input: UpdateWorkoutInput): Promise<Workout>;
deleteWorkout(id: number): Promise<void>;
```

Validate in the service layer:

- Workout name is not blank.
- A workout has at least one exercise.
- Exercise names are not blank.
- Reps and sets are greater than zero.
- Rest time is greater than zero.
- IDs are valid integers.

Create `SessionService` to coordinate starting a session, recording completed sets, completing sessions, and retrieving history.

The service layer should not know whether the caller is the terminal or React Native.

## Phase 6: Update the terminal application

Keep all user interaction in the CLI. Expand the main menu to:

```text
1. Create workout
2. List workouts
3. Start workout
4. Edit workout
5. Delete workout
6. View session history
7. Exit
```

The terminal flow should be:

```text
Prompt user
  → validate basic input
  → call service
  → display success or error
```

The CLI must not:

- Import the PostgreSQL pool directly.
- Contain SQL queries.
- Know table names.
- Read or write files for normal operation.

For a transition period, keep the existing text files untouched as backup data. Do not automatically delete them.

## Phase 7: Migrate existing text data

Create a one-time migration script, for example:

```text
scripts/migrateTextData.ts
```

The script should:

1. Read each file in `data/workouts`.
2. Parse the existing JSON.
3. Validate the workout.
4. Insert it through the repository.
5. Report successes and failures.
6. Avoid inserting duplicates if run more than once.

Migrate sessions only after workout IDs have been mapped correctly. Keep the original files until the migration has been verified.

## Phase 8: Add the HTTP server

Use Express for the API. Express routes should call controllers, and controllers should call services.

Example route set:

```text
GET    /api/workouts
GET    /api/workouts/:id
POST   /api/workouts
PUT    /api/workouts/:id
DELETE /api/workouts/:id

POST   /api/workouts/:id/sessions
POST   /api/sessions/:id/sets
POST   /api/sessions/:id/complete
GET    /api/sessions
GET    /api/sessions/:id
```

Controllers should:

- Read route parameters and request bodies.
- Call the appropriate service.
- Return JSON.
- Use appropriate status codes such as `200`, `201`, `204`, `400`, `404`, and `500`.
- Avoid implementing business rules or SQL.

Add centralized error handling so unexpected errors do not expose database details to the client.

## Phase 9: Test through the terminal before React Native

Test the backend with `curl` or a terminal API client before creating mobile screens.

Minimum tests:

1. Create a workout.
2. List workouts and confirm the new workout appears.
3. Retrieve one workout by ID.
4. Update its name and exercises.
5. Start a session for it.
6. Record completed sets.
7. Complete the session.
8. Retrieve session history.
9. Delete the workout.
10. Confirm invalid inputs return useful errors.
11. Confirm deleting a workout does not unexpectedly erase required historical session data.
12. Restart the application and confirm data remains in PostgreSQL.

Also test the lower-level services and repositories with automated tests where practical.

## Phase 10: Add React Native later

Once the API is stable, create the React Native application as a separate client.

The mobile app should call the API with requests such as:

```ts
const response = await fetch(`${API_URL}/api/workouts`);
const workouts = await response.json();
```

Create mobile screens for:

- Workout list.
- Workout creation.
- Workout editing.
- Workout details.
- Active workout session.
- Session history.

Do not move SQL or PostgreSQL credentials into the React Native project.

During local development, remember that `localhost` means different things depending on where the app runs. A simulator, emulator, or physical phone may need a special emulator address or the computer's local network address instead of `localhost`.

## Definition of done

The implementation is complete when:

- Workouts are stored in PostgreSQL.
- Exercises are related to workouts through foreign keys.
- Completed sessions and sets are stored in PostgreSQL.
- The terminal can create, list, update, delete, and start workouts.
- The terminal can display completed session history.
- No normal application path depends on the old text files.
- SQL is isolated inside repositories.
- Business rules are isolated inside services.
- The CLI contains terminal interaction only.
- The API exposes the same functionality without duplicating business logic.
- Existing workout timer behavior still works.
- Invalid inputs produce clear errors.
- Database credentials are stored outside source control.
- The API can be tested independently before the React Native frontend exists.

## Suggested implementation order

Complete the work in small checkpoints:

1. Split the current classes into model files.
2. Add PostgreSQL connection and schema.
3. Implement workout repository.
4. Replace file-based create/list behavior in the terminal.
5. Add update and delete behavior.
6. Implement session repositories and history.
7. Add migration for existing text files.
8. Add Express routes and controllers.
9. Test the complete API from the terminal.
10. Build the React Native frontend against the existing API.

At every checkpoint, compile the TypeScript application and manually test the affected terminal flow before moving on.
