# EverythingFitness

EverythingFitness is a TypeScript workout tracker backed by PostgreSQL. The terminal client and Express API share the same services and repositories.

## Setup

1. Install Node.js and PostgreSQL.
2. Create a local database, such as `everything_fitness_dev`.
3. Copy `.env.example` to `.env` and set `DATABASE_URL`.
4. Apply `src/database/schema.sql` to the database.
5. Run `npm install` and `npm run build`.


To import the existing text-file backups once the schema is ready, run `npm run migrate`. The original files are retained.

## Run

- `npm run build` Builds the project.
- `npm run cli` starts the terminal application.
- `GET /health` checks that the API process is running.

The API endpoints are documented in `IMPLEMENTATION_GUIDE.md`. Database credentials belong in `.env`, which is excluded from source control.
