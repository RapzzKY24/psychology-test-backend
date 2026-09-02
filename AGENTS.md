# AGENTS — psychology-test-backend

NestJS 11 + Prisma 7 + Better Auth + Zod 4. BE on **4000**, FE on 3000. Docs live in `../docs` (parent repo).

## Setup & Run (order matters)

```bash
cp .env.example .env          # then fill DATABASE_URL, BETTER_AUTH_SECRET (32+ chars), MAILTRAP_*
docker compose up -d          # postgres:16-alpine on 5432, db psychology_test
npm ci
npx prisma migrate dev        # reads prisma.config.ts, not schema url
npx prisma generate           # REQUIRED after every migrate (Prisma 7 does not auto-generate)
npm run build                 # nest build -> dist/src/main.js
PORT=4000 node dist/src/main.js  # or npm run start:dev
npm run seed:admin            # needs ADMIN_EMAIL/PASSWORD in .env
```

`DATABASE_URL` missing → boot fails fast (PrismaService). `BETTER_AUTH_SECRET` <32 chars → Better Auth warns and auth will fail.

## Key Quirks (verify via config, not docs)

- **Prisma 7:** `schema.prisma` has `datasource db { provider = "postgresql" }` with **no `url`**. `url` lives in `prisma.config.ts` (`defineConfig({ datasource: { url: env("DATABASE_URL") } })`). `generator client` has `output = "../src/generated/prisma"` + `moduleFormat = "cjs"`; generated client at `src/generated/prisma` is **gitignored** and uses `@prisma/adapter-pg` (`PrismaPg` in `PrismaService`). After `migrate`, always run `generate` manually.
- **Better Auth:** `main.ts` must be `NestFactory.create(AppModule, { bodyParser: false })` + `app.use(express.json())`. Auth mounted via `AuthModule.forRoot({ auth })` from `@thallesp/nestjs-better-auth` on **`basePath: "/api/v1/auth"`** (not `/api/auth`). Use `AllowAnonymous`, `Roles`, `Session` from that package — **do not create custom `AuthGuard`/`RolesGuard`/`@Public`/`@CurrentUser`** (library handles `ROLES` metadata, 401 vs 403). `auth.ts` uses `prismaAdapter` + `admin` plugin + `additionalFields.role` (`input: false`, default `PARTICIPANT`).
- **`src/common` is real:** `interceptors/transform.interceptor.ts` (`ApiResponse`/`PaginatedResponse`), `filters/http-exception.filter.ts` (`ErrorResponse`), `pipes/zod-validation.pipe.ts` (uses `safeParse` → 422), `dto/pagination.dto.ts`, `interfaces/api-response.interface.ts`. All success goes through `TransformInterceptor`, all errors through `HttpExceptionFilter` (both global in `main.ts`).
- **`@Body` validation:** pipe on param, not method: `@Body(new ZodValidationPipe(Schema)) dto: Dto` — method-level `@UsePipes` breaks `@Session()` (validates session object).
- **Overrides:** `package.json` pins `mysql2@3.24.3` + `deepmerge-ts@8.0.2` to fix audit in `better-auth`/`prisma` transitive deps.

## Structure (follow `../docs/standards/backend-standards.md`)

```
src/
  main.ts, app.module.ts
  common/{dto,filters,interceptors,interfaces,pipes}
  prisma/{prisma.service.ts,prisma.module.ts}  # @Global, PrismaPg adapter
  modules/<feature>/{controller,service,repository,dto,test,utils}
    # e.g. modules/admin/controller/admin-users.controller.ts
    #      modules/psychologist/service/psychologist.service.ts
    #      modules/health/test/health.service.spec.ts
  generated/prisma/  # gitignored, regenerated
  scripts/seed-admin.ts
prisma/{schema.prisma, migrations/, seed-data/}
prisma.config.ts
uploads/  # gitignored, for psychologist signatures + QRIS
```

1 feature = 1 folder in `modules/` with `controller/` (thin), `service/` (business), `repository/` (only Prisma), `dto/` (Zod `z.infer`). Utils: one file per helper (`validate-image-file.ts`, not `utils.ts`).

## Verification

```bash
npm run build                          # must pass
npx tsc --noEmit                       # typecheck (strict)
npm test                               # unit: 5 suites, 15 tests (per-module under src/modules/*/test)
npm test -- src/modules/health/test/health.service.spec.ts  # single module
npm run test:e2e                       # needs DB up
npm run lint                           # --fix; health.service.spec.ts `as any` mocks are expected (3 errors if strict)
curl http://localhost:4000/api/v1/health  # 200 {status:"ok",db:"up"} or 503
```

DB down → `GET /api/v1/health` is `503 {status:"error",db:"down"}`. Auth routes need `Origin: http://localhost:4000` + `Cookie: better-auth.session_token=...`; unauth → 401, wrong role → 403.

## Conventions

- **Commits:** `type(scope): subject` — e.g. `feat(auth): wire Better Auth`, `refactor(modules): ...`, `test(modules): ...`. One branch = one feature (`feat/admin-users`). Never push directly to `main`.
- **Types:** `strict: true`, no `any` (use `as unknown as T` or `// @ts-expect-error` with reason), explicit `Promise<T>` on repo/service, `z.infer` for DTOs, `ApiResponse<T>`/`PaginatedResponse<T>` for controllers.
- **Env:** never hardcode secrets; update `.env.example` in same PR as new env var. See `../docs/standards/tech-versions.md` for pinned versions (Prisma 7.10.0, better-auth 1.7.2, zod 4.5.4).
