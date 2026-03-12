# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev          # Start development server with hot reload
npx prisma migrate dev   # Run database migrations
npx prisma generate      # Regenerate Prisma client after schema changes
npx eslint src/          # Lint
npx prettier --write src/ # Format
```

Start the local PostgreSQL database before running the app:
```bash
docker compose up -d
```

## Architecture

**Stack:** Fastify + TypeScript + Prisma (PostgreSQL) + Zod + better-auth

**Entry point:** `src/index.ts` — registers plugins (CORS, Swagger, auth) and mounts route plugins with prefixes.

**Layer structure:**

- `src/routes/` — Fastify route plugins using `ZodTypeProvider` for type-safe request/response validation. Each route file exports an `async function` registered with `app.register()` and a URL prefix.
- `src/usecases/` — Class-based business logic with an `execute(dto)` method. Receive Prisma client via constructor, throw custom errors for failure cases.
- `src/schemas/` — Zod schemas for request bodies and response shapes, shared across routes.
- `src/errors/` — Custom error classes; route handlers catch these and map to HTTP status codes.
- `src/lib/db.ts` — Singleton Prisma client using `@prisma/adapter-pg`.
- `src/lib/auth.ts` — better-auth configuration (email/password, Prisma adapter, OpenAPI schema).
- `src/generated/prisma/` — Auto-generated Prisma client (do not edit manually).

**Database schema** (`prisma/schema.prisma`): User → WorkoutPlan → WorkoutDay → WorkoutExercise (all cascade delete). WorkoutDay also has WorkoutSession records. Auth tables (Session, Account, Verification) are managed by better-auth.

**Authentication:** Session-based via better-auth. Routes that require auth call `auth.api.getSession()` and return 401 if no session.

**API docs:** Available at `/docs` (Scalar UI) in development.

**Prisma config:** `prisma.config.ts` points to `prisma/schema.prisma` and generates the client to `src/generated/prisma`.
