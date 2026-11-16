# social-publisher

Panel web interno (un solo usuario) para programar y publicar posts con imagen en Paginas de Facebook e Instagram Business via Graph API de Meta. Spec completo: `docs/SPEC-TECNICO.md`. Decisiones: `docs/DECISIONES.md`. Barra de calidad: `CONSTRAINTS.md`. Modo aprendizaje activo: `APRENDIZAJE-social-publisher.md`.

## Stack

Monorepo npm workspaces. `apps/api`: NestJS 12 (ESM, imports con extension `.js`), Prisma 7 + PostgreSQL, BullMQ + Redis, Vitest, oxlint. `apps/web`: Next.js 16 (App Router), Tailwind. Sin Docker: Postgres y Redis nativos.

## Comandos

- Instalar: `npx npm@latest install` (npm 11.4.1 falla con un bug de arborist; npm 12 funciona)
- Levantar todo: `npm run dev` (API :3001, worker, web :3000)
- Test de un modulo: `npm test -w apps/api -- src/modules/<modulo>`
- Suite: `npm test -w apps/api && npm run test:e2e -w apps/api`
- Typecheck: `npm run typecheck` (o `-w apps/api` / `-w apps/web`)
- Prisma (desde `apps/api`): `npm run db:generate`, `npm run db:migrate`
- Entorno: copiar `apps/api/.env.example` a `.env` y `.env.test` (otra base: `social_publisher_test`)

- Al instalar un paquete nuevo, agregarlo a `docs/STACK-Y-PAQUETES.md` (que es y para que se usa, en español simple)

## Convenciones

- Controllers finos: DTO con class-validator, llaman al service. Logica en `@Injectable()` services que no reciben `Request`
- Acceso a Meta solo por `MetaGraphClient`; a R2 solo por `StorageService`
- Excepciones de negocio por modulo en `*.exceptions.ts`, extienden `HttpException` (4xx) para que el filtro global las responda sin reportarlas
- Escrituras multiples en DB con `prisma.$transaction`. Fechas en UTC en API y DB
- Nunca loguear tokens; usar `redact` / `redactString` de `src/common/redact.ts`
- Errores no controlados: filtro global + `ErrorReporterService` (mail al admin, solo en produccion)
- Tests de Meta y R2 siempre mockeados

## Flujo de trabajo

- Todo cambio de codigo en este proyecto (modulo, arreglo, ajuste) sigue mazar-dev
- Antes de cada commit corre mazar-review sobre los cambios
