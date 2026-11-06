# InClass Backend

Express and TypeScript REST API for the InClass student attendance management system. The primary database is Neon Serverless Postgres; no local PostgreSQL or Docker setup is required.

## Prerequisites

- Node.js 24.11 or newer
- pnpm 10 or newer
- A Neon development project or branch

## Neon setup

1. Create a project at [Neon](https://console.neon.tech/).
2. Keep separate Neon branches or projects for development, testing, and production.
3. In the Neon connection dialog, copy the pooled connection string for `DATABASE_URL`.
4. Disable pooling in the connection dialog and copy the direct connection string for `DIRECT_URL`.
5. Ensure both URLs contain `sslmode=require`.
6. Never point automated tests at the production branch. Use `TEST_DATABASE_URL` for a dedicated test branch.

Prisma 7 reads the migration connection from `prisma.config.ts`, which uses `DIRECT_URL`. The application uses `DATABASE_URL` with `@prisma/adapter-neon` for normal pooled queries.

## Installation

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
```

Replace every placeholder in `.env` before starting the API. Generate a strong access-token secret, for example with `openssl rand -base64 48`.

## Database migrations

Create migrations only against a disposable development Neon branch:

```bash
pnpm exec prisma migrate dev --name descriptive_change
```

Apply committed migrations in staging or production without resetting data:

```bash
pnpm db:migrate:deploy
pnpm db:migrate:status
```

Do not use `prisma db push` as a deployment strategy. Do not run `prisma migrate reset` against production or any branch containing data that must be retained.

The initial migration is committed in `prisma/migrations`. In this environment it was prepared without installed Prisma dependencies or Neon credentials. After installing dependencies, compare it with Prisma's offline output before applying it:

```bash
pnpm exec prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script > /tmp/inclass-init.sql
diff -u prisma/migrations/20261104000000_init/migration.sql /tmp/inclass-init.sql
```

Then verify and apply it on a development/test Neon branch before deployment.

## Development

```bash
pnpm dev
```

The API listens on `http://localhost:4000` by default. Database readiness is available at:

```text
GET /api/v1/health
```

The endpoint returns `200` when Neon is reachable and `503` when the database check fails.

## Quality checks

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
pnpm prisma:validate
```

Database integration tests introduced in later phases must use a dedicated Neon test branch and isolate their data between test cases.

## Current scope

Phase 1 contains the project infrastructure, complete initial data model, Neon/Prisma configuration, migration, health endpoint, structured logging, and centralized error handling. Authentication and all domain APIs are intentionally deferred to later phases.
