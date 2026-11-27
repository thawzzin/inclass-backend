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

Prisma 7 reads the migration connection from `prisma.config.ts`, which uses `DIRECT_URL`. Client generation and builds can run without it; migration commands require a real direct URL. The application uses `DATABASE_URL` with `@prisma/adapter-neon` for normal pooled queries.

## Installation

```bash
cp .env.example .env
pnpm install
pnpm prisma:generate
```

Replace every placeholder in `.env` before starting the API. Generate a strong access-token secret, for example with `openssl rand -base64 48`.

## Initial administrator

After applying database migrations, create the first administrator through the interactive terminal command:

```bash
pnpm user:create
```

The command prompts for the administrator's name, email address, password, and confirmation. Password input is hidden and stored as a bcrypt hash using Neon's `pgcrypto` extension. It creates an `ADMIN` only when the database does not already contain one; after that, use the application to create and manage teacher accounts.

This command is the production-safe bootstrap path. It does not expose a public registration endpoint and does not create student login accounts.

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

## Development seed data

After applying migrations to a development or test Neon branch, run:

```bash
pnpm db:seed
```

The seed is idempotent and refuses to run with `NODE_ENV=production`. It creates the configured admin, two teachers, CSC480 with sections 901–903, 18 sample students, enrollments, and three sample attendance dates. The teacher seed password is `TeacherPassword123!`; change it before using any non-development environment.

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

This runs the Cloudflare Worker locally with the values from `.env`, using the same Prisma runtime as the deployed API. The local compatibility date is pinned to the version supported by the project's installed Wrangler binary; deployment keeps the date in `wrangler.jsonc`. The API listens on `http://localhost:4000` by default. Database readiness is available at:

```text
GET /api/v1/health
```

The endpoint returns `200` when Neon is reachable and `503` when the database check fails.

## Authentication

Authentication uses a short-lived signed access-token cookie and an opaque rotating refresh-token cookie. Both are `HttpOnly`; production cookies are also `Secure` and `SameSite=Lax`. The browser must first request `GET /api/v1/auth/csrf`, retain the returned readable CSRF cookie, and send the response token in `X-CSRF-Token` for every state-changing authentication request.

Available Phase 2 routes:

```text
GET    /api/v1/auth/csrf
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
GET    /api/v1/auth/me
PATCH  /api/v1/auth/profile
PATCH  /api/v1/auth/password
```

## Teacher management

All teacher-management routes require an authenticated `ADMIN` user and a CSRF token for writes. They only operate on users whose database role is `TEACHER`; administrator accounts cannot be accessed through these routes.

```text
GET    /api/v1/users
POST   /api/v1/users
GET    /api/v1/users/:id
PATCH  /api/v1/users/:id
PATCH  /api/v1/users/:id/status
PATCH  /api/v1/users/:id/password
```

Changing a teacher password or status increments the token version and revokes that teacher's active refresh sessions.

## Student management

Administrators can manage the intentionally minimal student profile: university student ID, full name, optional nickname, and active/inactive status. `GET /api/v1/students` supports `page`, `pageSize`, `search`, and `status`; writes require CSRF protection.

## Courses and sections

Admins manage courses and sections at `/api/v1/courses` and `/api/v1/sections`; teachers can only read courses and sections assigned to them. Section assignment requires an active teacher and section codes are unique within a course.

The Worker limits login to 10 requests per visitor IP per 15 minutes using a shared Neon table. The local Node server does not apply this Worker ingress limit.

`TRUST_PROXY` defaults to `false`. Enable it only when the deployment uses a correctly configured trusted reverse proxy; otherwise client-controlled `X-Forwarded-For` headers can undermine IP-based login throttling.

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

## Cloudflare Workers Free deployment

The API is a standard Worker using Cloudflare's Express HTTP adapter. A separate frontend Worker calls it through a Service Binding, keeping browser cookies on the frontend's `workers.dev` origin.

1. Apply migrations from a trusted machine with `DIRECT_URL` set: `pnpm db:migrate:deploy`. This enables `pgcrypto` and creates the shared login limit table. Do not provide `DIRECT_URL` to the Worker.
2. Existing Argon2id hashes cannot be verified by the Worker. Run `pnpm user:password-status` with `DATABASE_URL` to count affected accounts. For each account, run `pnpm user:convert-password` in a trusted interactive terminal and enter its current password. This verifies the Argon2id hash locally, stores a bcrypt hash for the same password, and revokes existing sessions. If the current password is unavailable or exceeds 72 UTF-8 bytes, run `pnpm user:reset-password` instead. Repeat the status command until it reports zero. For a fresh database, run `pnpm user:create` after migrations instead.
3. Add secrets with `pnpm exec wrangler secret put NAME` for `DATABASE_URL`, `JWT_ACCESS_SECRET`, and `CSRF_SECRET`. Use the pooled Neon URL. `ALLOW_ORIGINS` in `wrangler.jsonc` lists permitted frontend origins as a comma-separated string; set it separately for production and previews. Local `.env` files can continue using `FRONTEND_URL` when `ALLOW_ORIGINS` is unset.
4. Run `pnpm build:worker` and `pnpm deploy`. The frontend Service Binding targets the Worker name `inclass-backend`. Check the backend's `/api/v1/health` route, then the same path through the frontend Worker after deploying it.

For Cloudflare Git deployment, set the build command to `pnpm build:worker` and the deploy command to `pnpm deploy` in this repository. Deploy the frontend repository only after this Worker is available.

Use `.dev.vars` for disposable local Worker secrets. Keep production secrets out of Git. The Free plan's 10 ms CPU limit per request must be checked against real login and authenticated requests; successful bundling alone does not establish runtime compatibility.

## Attendance and dashboard

Attendance sessions preserve their captured roster. History is available at `GET /api/v1/attendance-records` with `sectionId`, `dateFrom`, `dateTo`, `status`, `page`, and `pageSize` filters; add `format=csv` to export permitted records. Section summaries are at `/api/v1/sections/:id/attendance-statistics`, student history is at `/api/v1/students/:id/attendance`, and dashboard routes are under `/api/v1/dashboard`.

## API documentation

The starter OpenAPI contract is in `openapi.yaml`. Import it into Swagger Editor or another OpenAPI viewer. It documents the core health, authentication, attendance-history, and dashboard routes; the source routes remain authoritative while the contract is expanded in future maintenance.
