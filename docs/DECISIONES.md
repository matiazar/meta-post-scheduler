# Decisiones: social-publisher

Registro de decisiones de arquitectura. Solo se agrega. Las decisiones que cambian se reemplazan, no se editan.

## DEC-001: NestJS + Next.js en monorepo con npm workspaces

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-01)

Contexto: Panel interno de un solo usuario. Matias quiere aprender Node/Nest/Next.
Decision: `apps/api` (NestJS) y `apps/web` (Next.js) en un monorepo con npm workspaces.
Alternativa descartada: Laravel + Filament.
Por que: objetivo de aprendizaje, proyecto interno sin plazo.
Consecuencias: mas piezas armadas a mano (panel, auth). Laravel habria sido mas rapido.
Duda adversarial: corrio en mazar-spec antes de aprobar el spec.

## DEC-002: Scheduler propio basado en la DB, igual para FB e IG

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-02)

Contexto: hay que publicar a la hora indicada en FB e IG.
Decision: job repetible de BullMQ cada minuto (tick) que toma PostTarget vencidos con `SELECT ... FOR UPDATE SKIP LOCKED`, los marca QUEUED y encola un job `publish` por target. Recuperacion de colgados: QUEUED > 5 min vuelve a PENDING; PUBLISHING > 15 min se resuelve segun DEC-007. No se usa `scheduled_publish_time` de FB.
Alternativa descartada: (a) delayed jobs de BullMQ por post; (b) programacion nativa de FB.
Por que: la DB es la unica fuente de verdad, reprogramar es un UPDATE y si Redis se reinicia los targets vuelven solos a PENDING.
Consecuencias: precision de ~1 minuto.

## DEC-003: PostgreSQL + Prisma

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-03), confirmado por Matias en el kickoff

Contexto: elegir DB y ORM.
Decision: PostgreSQL (nativo en Windows, sin Docker) con Prisma 7 y adaptador `@prisma/adapter-pg`.
Alternativa descartada: MySQL/MariaDB + TypeORM.
Por que: mejor DX en TS, soporta `SKIP LOCKED`, es el default del ecosistema.
Consecuencias: Prisma no expone `FOR UPDATE SKIP LOCKED`, se usa `$queryRaw`.

## DEC-004: Imagenes en R2 con bucket publico y keys con UUID

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-04)

Contexto: IG exige URL publica para la imagen.
Decision: Cloudflare R2 con acceso publico y keys con UUID.
Alternativa descartada: (a) servirlas desde el VPS; (b) URLs firmadas.
Por que: R2 no cobra egress; una URL firmada vencida rompe reintentos tardios.
Consecuencias: cualquiera con la URL ve la imagen (son imagenes de marketing).

## DEC-005: Una conexion Meta via Facebook Login; IG por la Graph API de Facebook; app Live con Standard Access

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-05)

Contexto: publicar en varias Paginas e IG propios.
Decision: un solo login OAuth de Matias; IG vinculado a Pagina; app en modo Live con Standard Access, sin App Review.
Alternativa descartada: (a) Instagram API with Instagram Login; (b) token pegado a mano del Graph API Explorer; (c) modo desarrollo (los posts no serian publicos).
Por que: un login da todas las Paginas y sus IG; los page tokens derivados de un token largo no vencen.
Consecuencias: si Meta exigiera Advanced Access habria que pasar App Review. Se valida en las etapas 3 y 10.

## DEC-006: Original al subir; JPEG generado por post con una proporcion unica

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-06)

Contexto: IG recorta todos los items de un carrusel segun el primero.
Decision: se guarda el original y al guardar el post sharp genera un JPEG por imagen con la proporcion y el modo (CROP/PAD) del post.
Alternativa descartada: procesar al subir con proporcion propia; procesar en el worker; version distinta por red.
Por que: el preview es exactamente lo que se publica.
Consecuencias: HEIC no soportado, se pide convertir antes.

## DEC-007: Estado y reintentos por destino (PostTarget), con proteccion contra doble publicacion en IG

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-07)

Contexto: si FB sale bien e IG falla, reintentar todo duplicaria el post en FB.
Decision: cada target se publica y reintenta por separado; estado del Post derivado de sus targets; `igContainerId` guardado para no republicar en IG; FB colgado se marca FAILED con aviso de revision manual.
Alternativa descartada: estado unico por post con reintento completo.
Por que: evita duplicados.
Consecuencias: logica de derivacion de estado en `PostsService`.

## DEC-008: Auth con un usuario en env y JWT en cookie httpOnly

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-08)

Contexto: panel de un solo usuario.
Decision: `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt) en `.env`; JWT en cookie httpOnly firmada por la API.
Alternativa descartada: NextAuth/Auth.js; tabla de usuarios.
Por que: lo mas simple que protege el panel.
Consecuencias: si algun dia es multi-usuario se agrega tabla User y esta decision se reemplaza.

## DEC-009: Tokens de Meta cifrados en DB (AES-256-GCM)

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-09)

Contexto: un dump de la DB no debe permitir publicar en las Paginas.
Decision: cifrado AES-256-GCM con `TOKEN_ENC_KEY` (32 bytes base64).
Alternativa descartada: texto plano.
Por que: defensa en profundidad.
Consecuencias: perder la clave obliga a reconectar Meta (no se pierden posts).

## DEC-010: API y worker como procesos separados del mismo proyecto Nest

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-10)

Contexto: un deploy o pico en la API no debe cortar publicaciones.
Decision: `main.ts` (HTTP) y `worker.ts` (tick + processors), mismo codigo. `npm run dev` levanta API, worker y web.
Alternativa descartada: worker dentro del proceso HTTP.
Por que: se reinician por separado.
Consecuencias: el processor de mail y los de publicacion solo se registran en `WorkerModule`.
