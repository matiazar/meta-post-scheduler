# Spec técnico: social-publisher

Estado: APROBADO por el autor (2026-11-16), con cambios: S6 sin Docker (Postgres y Redis nativos), S5 Postgres confirmado
Autor: matiazar (uso personal)

## 1. Resumen

Panel web interno, de un solo usuario, para programar y publicar posts con imágenes en Páginas de Facebook y cuentas de Instagram Business/Creator de las apps propias del autor. Se sube la imagen, se escribe el copy, se eligen las cuentas destino y la fecha/hora, y un worker publica a la hora indicada usando la Graph API oficial de Meta. Si algo falla, reintenta y avisa por mail.

No es un SaaS: no hay registro, ni multi-tenant, ni cobros. La app de Meta va en modo **Live con Standard Access**, sin App Review: Standard Access alcanza para publicar en Páginas e IG de usuarios con rol en la app (el autor). No puede quedar en modo desarrollo porque ahí lo publicado solo lo ven los usuarios con rol en la app (ver DEC-05).

## 2. Alcance (incluido)

- Login de un único usuario administrador (credenciales en `.env`)
- Conexión con Meta: botón "Conectar con Facebook" (OAuth), canje a token de larga duración, sincronización de Páginas y cuentas IG vinculadas
- Marcas (una por app o negocio propio) con sus cuentas sociales asociadas, color, hashtags y firma por defecto
- Subida de imágenes (drag and drop, varias a la vez, JPG/PNG/WebP), almacenamiento del original en Cloudflare R2, y procesamiento a JPEG con la proporción elegida para el post (1:1, 4:5, 1.91:1) en modo recortar o rellenar, con URL pública
- Composer de post: marca, cuentas destino (FB y/o IG), imagen única o carrusel (2 a 10 imágenes), copy base + override por red, fecha/hora, vista previa del recorte de IG
- Calendario (vista mes y semana) con los posts programados, arrastrar para reprogramar, filtro por marca
- Estados por post y por destino, detalle con error y permalink, botón "reintentar" y "publicar ahora"
- Scheduler propio: tick cada minuto que toma posts vencidos y los encola en BullMQ; worker que publica en FB e IG con reintentos
- Avisos por mail ante fallo definitivo de publicación o token de Meta inválido
- Reporte de errores no controlados por mail al admin

## 3. Fuera de alcance (v1)

- Video, Reels, Stories (ver supuesto S1)
- TikTok, X, LinkedIn u otras redes en la v1 (entran por etapas desde la 12, ver DEC-013)
- Generación de imágenes con IA (el copy y hashtags con IA entran como etapa 11, ver DEC-011)
- Métricas/analytics de los posts
- Multi-usuario, roles, multi-tenant, cobros
- App Review de Meta (no hace falta para uso propio con Standard Access)
- HEIC (fotos de iPhone sin convertir): sharp precompilado no lo soporta. Se rechaza con mensaje claro
- Responder comentarios o mensajes
- Deploy a producción (se prepara después en una etapa de deploy)

## 4. Supuestos (no confirmados por el autor, revisar)

- S1. Solo imágenes en v1 (imagen única y carrusel). Video/Reels quedan para v2
- S2. Todas las marcas tienen Página de FB; el IG de cada una es Business o Creator y está vinculado a su Página. Una marca puede tener solo una de las dos redes
- S3. Copy base común a todas las redes, con override opcional por destino. Hashtags y firma por marca se agregan al final al componer (editables)
- S4. Login: un solo usuario, `ADMIN_EMAIL` + `ADMIN_PASSWORD_HASH` (bcrypt) en `.env`. Sin registro ni recuperar contraseña
- S5. Base de datos PostgreSQL con Prisma
- S6. Desarrollo local SIN Docker (decisión del autor). Postgres 18 nativo en Windows (ya instalado) con dos bases: `social_publisher` y `social_publisher_test`. Redis nativo (hoy hay un Redis 5.0.14 para Windows; BullMQ lo tolera, se recomienda 6.2+. Si da problemas: Redis en WSL Ubuntu, que ya existe). Conexiones por `DATABASE_URL` y `REDIS_URL` en `.env` / `.env.test`
- S7. Zona horaria del panel: `America/Argentina/Tucuman`. En DB todo en UTC
- S8. Storage: bucket de Cloudflare R2 propio, con acceso público (dominio r2.dev o subdominio propio). Las keys llevan un UUID para que no sean adivinables
- S9. Reporte de errores y avisos por mail vía SMTP (credenciales en `.env`)
- S10. Volumen bajo: decenas de posts por semana. Lejos del tope de IG (100 posts por 24 h por cuenta)
- S11. Idioma del panel: español. Un solo idioma

## 5. Stack y por qué

| Pieza | Elección |
|-------|----------|
| Lenguaje | TypeScript en todo el proyecto. Lint: oxlint en api (default de Nest 12), ESLint en web |
| Backend | NestJS (API REST + worker en el mismo proyecto, distinto entrypoint) |
| Frontend | Next.js (App Router), Tailwind CSS, shadcn/ui |
| DB / ORM | PostgreSQL + Prisma |
| Colas | BullMQ + Redis |
| Imágenes | sharp |
| Storage | Cloudflare R2 vía `@aws-sdk/client-s3` (API compatible S3) |
| Mail | nodemailer (SMTP) |
| Monorepo | npm workspaces: `apps/api`, `apps/web` |
| Tests | Vitest (api, es lo que trae el generador de Nest 12; reemplaza a Jest), Playwright no en v1 |

Por qué NestJS + Next.js y no Laravel (default del autor): es un proyecto interno sin cliente ni plazo, y el autor quiere aprender Node/Nest/Next. Laravel sería más rápido de construir (scheduler, colas y panel con Filament casi gratis). Se acepta el costo extra a cambio del aprendizaje. Modo aprendizaje activo (APRENDIZAJE-social-publisher.md).

## 6. Roles y permisos

Un único rol: admin. Todas las rutas de la API, salvo `POST /auth/login`, `GET /health` y el callback de OAuth, requieren sesión válida.

## 7. Modelo de datos

Todas las tablas con `id` (cuid), `createdAt`, `updatedAt`. Fechas en UTC.

**SocialConnection** (DEC-014: una fila por login con una red; reemplaza a MetaConnection y ThreadsConnection)
- `provider`: META | THREADS; `externalId` (id del usuario en la red), único junto con `provider`
- `displayName`
- `tokenEnc` (token de larga duración, cifrado), `refreshTokenEnc` (opcional)
- `tokenExpiresAt` (null = no vence), `tokenRefreshedAt` (null = nunca se renueva)
- `status`: ACTIVE | INVALID
- `lastSyncedAt`, `data` (JSON solo para lo propio de cada red)
- Meta: una sola fila vigente que da muchas cuentas (Páginas e IG); Threads: una fila por perfil

**Brand** (una por app propia)
- `name`, `slug` (único), `color` (hex, para el calendario)
- `defaultHashtags` (texto), `signature` (texto)
- `active`

**SocialAccount**
- `brandId` -> Brand (nullable: queda sin asignar hasta que se mapea)
- `network`: FACEBOOK | INSTAGRAM
- `externalId` (page id o ig user id), único por network
- `name`, `username` (IG), `pictureUrl`
- `pageId` (para IG: id de la Página vinculada, de donde sale el token)
- `pageTokenEnc` (solo FACEBOOK; IG usa el token de su Página)
- `active`

**Media** (el original subido)
- `originalKey` (key en R2), `originalFilename`
- `width`, `height`, `sizeBytes`, `mime`

**Post**
- `brandId` -> Brand
- `caption` (copy base)
- `scheduledAt` (UTC, nullable si es borrador)
- `aspectRatio`: SQUARE (1:1) | PORTRAIT (4:5) | LANDSCAPE (1.91:1). Uno por post: IG recorta todos los items del carrusel según el primero
- `fitMode`: CROP | PAD
- `status`: DRAFT | SCHEDULED | PUBLISHING | PUBLISHED | PARTIAL | FAILED | CANCELLED. Derivado de los targets y recalculado en `PostsService` (ver DEC-07). DRAFT y CANCELLED los pone el usuario

**PostMedia**
- `postId`, `mediaId`, `position` (0..9). Único (`postId`, `position`)
- `processedKey`, `publicUrl`, `width`, `height` (versión JPEG generada con el `aspectRatio` y `fitMode` del post; se regenera si cambian)

**PostTarget** (un destino = una cuenta social)
- `postId`, `socialAccountId`. Único (`postId`, `socialAccountId`)
- `captionOverride` (nullable)
- `status`: PENDING | QUEUED | PUBLISHING | PUBLISHED | FAILED
  - QUEUED: el tick lo tomó y lo encoló, todavía no se llamó a Meta
  - PUBLISHING: el processor arrancó y está llamando a Meta
- `attempts`, `nextAttemptAt`, `lastError`, `lastErrorCode`
- `externalPostId`, `permalink`, `publishedAt`
- `igContainerId` (container padre en carrusel, el único en imagen sola; ver DEC-07)
- `queuedAt`, `startedAt` (para detectar colgados, ver DEC-02)

**PublishAttempt** (log, solo agregar)
- `postTargetId`, `startedAt`, `finishedAt`, `ok`, `errorCode`, `errorMessage`, `responseSnippet` (recortado, sin tokens)

Relaciones: Brand 1-N SocialAccount, Brand 1-N Post, Post N-N Media (vía PostMedia), Post 1-N PostTarget, PostTarget 1-N PublishAttempt.

Regla: los targets de un post solo pueden ser cuentas de la marca del post.

## 8. Módulos

### API (apps/api)

| Módulo | Qué hace | Depende de |
|--------|----------|------------|
| `config` | Carga y valida env con zod al arrancar (falla si falta algo) | - |
| `prisma` | PrismaService | config |
| `crypto` | Cifrado AES-256-GCM de tokens con `TOKEN_ENC_KEY` | config |
| `mail` | Envío SMTP encolado; usado por errores y avisos | config, BullMQ |
| `errors` | Filtro global de excepciones: reporta al admin por mail (no en local/test), redacta tokens, throttle | mail |
| `health` | `GET /health` (DB y Redis) | prisma |
| `auth` | Login admin, JWT en cookie httpOnly, guard global | config |
| `meta` | OAuth con Facebook (con parámetro `state` firmado contra CSRF), canje a token largo, sync de Páginas e IG, `MetaGraphClient` (fetch con timeout, mapeo de errores) | crypto, prisma |
| `brands` | CRUD de marcas y asignación de cuentas sociales | prisma |
| `media` | Upload multipart del original a R2, validación; `ImageProcessor` (sharp) que genera la versión por post | config |
| `posts` | CRUD de posts, targets, query para el calendario, reprogramar, cancelar, reintentar, publicar ahora | brands, media |
| `publisher` | Tick cada minuto, cola `publish`, processors FB e IG, reintentos, avisos | posts, meta, mail |

Entrypoints: `main.ts` (API HTTP) y `worker.ts` (tick + processors de BullMQ). Mismo código, procesos separados.

### Web (apps/web)

| Pantalla | Qué hace |
|----------|----------|
| `/login` | Login |
| `/` Calendario | Vista mes/semana, posts como chips con color de marca e iconos de red, estado visible, drag para reprogramar, filtro por marca, click abre el detalle |
| `/posts/new`, `/posts/[id]` | Composer: marca, cuentas, dropzone de imágenes con reordenar, modo recortar/rellenar, copy base + tabs por red, contador de caracteres (2200 IG), preview tipo feed IG y FB, fecha/hora, guardar borrador / programar / publicar ahora |
| `/posts/[id]` (detalle) | Estado por destino, error legible, permalink, reintentar, cancelar |
| `/settings/meta` | Estado de la conexión, botón conectar/reconectar, sincronizar |
| `/settings/brands` | CRUD de marcas y mapeo de cuentas sociales a cada marca |

La web habla con la API por fetch con cookie (`credentials: include`). Sin lógica de negocio en Next.

## 9. Integraciones externas

### Meta Graph API (versión fijada en env, `META_GRAPH_VERSION`, ej. v24.0 o la vigente al scaffold)

Prerrequisitos manuales (los hace el autor en developers.facebook.com, quedan como checklist en el README):
1. App tipo Business con producto "Facebook Login for Business"
2. Permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
3. App en modo **Live** con Standard Access en esos permisos (sin App Review), el autor con rol admin. Para pasar a Live Meta pide URL de política de privacidad, ícono, categoría e instrucciones de borrado de datos: alcanza una página simple en cualquier dominio propio. Verificar en la etapa 10 que un post sea visible desde una cuenta sin rol en la app
4. Redirect URI: `http://localhost:3001/meta/callback` (dev) y la de producción después
5. Cada IG Business/Creator vinculado a su Página

Flujo de conexión:
- OAuth -> code -> token corto -> `GET /oauth/access_token?grant_type=fb_exchange_token` -> token largo (~60 días)
- `GET /me/accounts?fields=id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}`
- Page tokens obtenidos desde un token de usuario largo no vencen. Se guardan cifrados por Página
- Sync: upsert de SocialAccount (FB e IG), las cuentas que desaparecen quedan `active=false`

Publicación en Facebook (Página):
- Imagen única: `POST /{page-id}/photos` con `url` (R2) y `message` -> `post_id`
- Carrusel: por cada imagen `POST /{page-id}/photos` con `url` y `published=false` -> ids; después `POST /{page-id}/feed` con `message` y `attached_media[i]={"media_fbid":id}`
- No se usa `scheduled_publish_time` (ver DEC-02)

Publicación en Instagram:
- Imagen única: `POST /{ig-user-id}/media` con `image_url` y `caption` -> container id; esperar `status_code=FINISHED` (poll cada 3 s hasta 60 s, `IN_PROGRESS` sigue esperando); `POST /{ig-user-id}/media_publish` con `creation_id` -> media id
- Carrusel: un container por imagen con `is_carousel_item=true` (cada uno hasta FINISHED); container padre con `media_type=CAROUSEL`, `children` y `caption`; esperar FINISHED; `media_publish` con el padre
- Permalink: `GET /{media-id}?fields=permalink`
- Restricciones: solo JPEG, proporción 4:5 a 1.91:1 (también 3:4), caption hasta 2200 caracteres, hasta 10 items en carrusel, 100 posts por 24 h por cuenta
- Token: el page token de la Página vinculada

Mapeo de errores (en `MetaGraphClient`):
- Permanentes (no reintenta): 190 token inválido (además marca la SocialConnection INVALID y avisa "reconectar"), 10/200 permisos, 100 parámetro inválido, subcodes 2207xxx de formato o contenido de media no listados abajo
- Transitorios (reintenta con el backoff de DEC-07): 1, 2, 4, 17, 32, 613 (rate limit), subcodes 2207001, 2207003, 2207008, 2207027 (media no lista), 2207032, 5xx, timeout de red
- Límite diario de IG (9 / 2207042): no consume intentos; `nextAttemptAt` = +1 h, hasta 24 h desde el primer intento, después FAILED
- La lista exacta de subcodes se confirma contra la doc de errores de IG vigente al implementar la etapa 3

### Cloudflare R2

- Bucket con acceso público. Keys: `originals/{yyyy}/{mm}/{uuid}.{ext}` y `processed/{yyyy}/{mm}/{uuid}.jpg`
- Env: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
- Las imágenes no se borran al publicar (v1). Limpieza de huérfanas queda para después

### SMTP

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`, `ADMIN_EMAIL`

## 9b. Manejo de errores

- Canal: mail a `ADMIN_EMAIL`. No se reporta en `NODE_ENV=development` ni `test`
- Filtro global de excepciones de Nest: reporta 5xx no controlados, ignora 4xx esperados (validación, 401, 404), redacta `access_token`, `password`, `*_token`, `Authorization`, throttle de 1 mail por firma de error cada 10 minutos, envío encolado con try/catch (el reporte nunca rompe la request)
- El worker reporta jobs que fallan de forma no controlada con el mismo mecanismo
- Excepciones de negocio previstas:
  - `posts`: `PostNotEditableException` (ya publicado o publicando), `ScheduledAtInPastException`, `TargetNotInBrandException`, `CarouselSizeException` (más de 10 o carrusel con 1), `CaptionTooLongException`
  - `media`: `UnsupportedImageException` (formato no soportado, HEIC, archivo corrupto), `ImageTooLargeException` (más de 20 MB de origen)
  - `meta`: `MetaConnectionInvalidException`, `MetaApiException` (con `code`, `subcode`, `isTransient`), `AccountWithoutTokenException`
  - `publisher`: `PublishPermanentError`, `PublishTransientError`
- Avisos funcionales (no son errores de la app): mail cuando un target queda FAILED definitivo, y cuando el token de Meta pasa a INVALID
- Llamadas a Meta y R2: timeout de 30 s (upload de imágenes 60 s)
- La UI muestra mensajes en español entendibles ("Instagram rechazó la imagen: proporción no válida"); el detalle técnico queda en PublishAttempt

## 10. Decisiones de arquitectura

**DEC-01. Stack NestJS + Next.js en monorepo con npm workspaces.**
Descartada: Laravel + Filament. Por qué: objetivo de aprendizaje; proyecto interno sin plazo. Costo aceptado: más piezas que armar a mano (panel, auth).

**DEC-02. Scheduler propio basado en la DB, igual para FB e IG; no se usa la programación nativa de FB.**
Cómo: el worker corre un job repetible de BullMQ cada minuto (tick). El tick toma, dentro de una transacción con `SELECT ... FOR UPDATE SKIP LOCKED` (vía `prisma.$queryRaw`, Prisma no lo expone en su API), los PostTarget con `status=PENDING`, cuyo post **no** está en DRAFT ni CANCELLED, con `scheduledAt <= now` y (`nextAttemptAt` nulo o `<= now`). El filtro es por estado del target, no del post, para que los reintentos y el botón "reintentar" entren aunque el post ya esté PUBLISHING, PARTIAL o FAILED. Los marca `QUEUED` con `queuedAt` y encola un job `publish` por target (`jobId = {targetId}-{attempt}`; BullMQ no permite `:` en ids custom). El processor pasa el target a `PUBLISHING` con `startedAt` justo antes de llamar a Meta.
Colgados (revisados en cada tick):
- `QUEUED` con `queuedAt` de más de 5 minutos: nunca se llamó a Meta (Redis se reinició o falló el encolado). Vuelve a `PENDING` sin consumir intento. Es seguro
- `PUBLISHING` con `startedAt` de más de 15 minutos: la llamada a Meta pudo haber salido. Se resuelve según DEC-07
Descartadas: (a) delayed jobs de BullMQ por post: reprogramar o cancelar exige ubicar y borrar jobs, y si se pierde Redis se pierden los programados; (b) `scheduled_publish_time` nativo de FB: solo existe en FB (IG igual necesita scheduler propio), tiene ventana de 10 min a 30 días, y quedarían dos flujos distintos.
Por qué: la DB es la única fuente de verdad, reprogramar es un UPDATE, y si Redis se reinicia los targets encolados vuelven solos a PENDING. Precisión de hasta ~1 minuto, suficiente.

**DEC-03. PostgreSQL + Prisma.**
Descartada: MySQL + TypeORM. Por qué: Prisma es el ORM con mejor DX en TS y el más usado con Nest hoy; Postgres soporta `SKIP LOCKED` y es el default del ecosistema. el autor ya conocía MySQL, pero aprender Postgres suma.

**DEC-04. Imágenes en R2 con bucket público y keys con UUID.**
Descartadas: (a) servirlas desde el propio VPS: obliga a tener el server expuesto y con buen ancho de banda desde local; (b) URLs firmadas: IG y FB descargan la imagen en el momento de publicar y una URL vencida rompe reintentos tardíos. Por qué: IG exige URL pública; R2 no cobra egress. Riesgo aceptado: cualquiera con la URL ve la imagen (son imágenes de marketing, públicas igual).

**DEC-05. Una conexión Meta vía Facebook Login (OAuth) y publicación de IG por la Graph API de Facebook (IG vinculado a Página).**
Modo de la app: **Live con Standard Access**, sin App Review. En modo desarrollo lo que se publica solo lo ven los usuarios con rol en la app (doc de Meta "App Modes"), así que los seguidores no verían los posts de FB. Standard Access permite usar los permisos con cuentas de usuarios que tienen rol en la app, que es el caso.
Descartadas: (a) "Instagram API with Instagram Login": requiere un login por cada cuenta IG y no cubre FB; (b) pegar a mano un token del Graph API Explorer: funciona pero hay que repetirlo y es fácil equivocarse de permisos; (c) modo desarrollo: los posts no serían públicos. Por qué: un solo login del autor da todas las Páginas y sus IG; los page tokens derivados de un token largo no vencen.
Riesgo: si Meta exigiera Advanced Access para algún permiso en Live, habría que pasar App Review. Se valida en la etapa 3 (conexión) y en la etapa 10 (visibilidad real) antes de construir más encima.

**DEC-06. Original guardado al subir; versión JPEG generada por post con una proporción única para todo el post, usada para FB e IG.**
Cómo: al subir se valida (JPG/PNG/WebP, hasta 20 MB) y se guarda el original en R2. Al guardar el post, sharp genera por cada imagen: rotación según EXIF, sRGB, JPEG calidad 90, ancho máximo 1440 px, llevada al `aspectRatio` del post (1:1, 4:5 o 1.91:1) con el `fitMode` (CROP: recorte centrado; PAD: relleno blanco o color de marca). Se regenera si cambian proporción o modo.
Descartadas: (a) procesar cada imagen al subir con su propia proporción: en un carrusel IG recorta todos los items según el primero, y el preview no coincidiría con lo publicado; (b) procesar en el worker al publicar: el preview no sería exacto y el worker haría trabajo pesado; (c) versión distinta por red: FB acepta el mismo JPEG. Por qué: el preview es exactamente lo que se publica.
Riesgo aceptado: HEIC no soportado (sharp precompilado no trae libheif); se pide convertir antes.

**DEC-07. Estado y reintentos por destino (PostTarget), con protección contra doble publicación en IG.**
Cómo: cada target se publica y reintenta por separado.
Estado del Post derivado de sus targets (fuera de DRAFT y CANCELLED):
- SCHEDULED: todos PENDING y ninguno con intentos
- PUBLISHING: alguno en QUEUED o PUBLISHING, o alguno PENDING esperando reintento (`attempts > 0`)
- PUBLISHED: todos PUBLISHED
- PARTIAL: ninguno pendiente, algunos PUBLISHED y otros FAILED
- FAILED: ninguno pendiente y todos FAILED
Reintentos para errores transitorios: hasta 4 intentos, a los 1, 5 y 15 minutos (`nextAttemptAt`); el límite diario de IG tiene su propia regla (sección 9). "Reintentar" desde la UI pasa los targets FAILED a PENDING con `attempts=0` y `nextAttemptAt=now`.
IG, protección contra doble publicación: se guarda `igContainerId` (el padre en carrusel) apenas se crea. Si un reintento o un colgado en PUBLISHING encuentra container guardado, consulta su `status_code`:
- `PUBLISHED`: no se vuelve a publicar. El container no expone el media id, así que se busca en `GET /{ig-user-id}/media?fields=id,caption,timestamp,permalink&limit=10` el que coincide en caption y timestamp posterior a `startedAt`. Si aparece, se guarda id y permalink; si no, se marca PUBLISHED sin permalink y se avisa
- `FINISHED`: solo se llama a `media_publish`
- `IN_PROGRESS`: se espera (poll) como en el flujo normal
- `EXPIRED` o `ERROR`: se crea un container nuevo
FB: un target colgado en PUBLISHING (llamada que pudo haber salido) se marca FAILED con aviso "revisar manualmente en la Página" en vez de reintentar a ciegas. Un error de respuesta claro (no timeout) sí se reintenta según la tabla de errores.
Descartada: estado único por post con reintento completo. Por qué: si FB sale bien e IG falla, reintentar todo duplicaría el post en FB.

**DEC-08. Auth: un usuario desde env, JWT en cookie httpOnly firmada por la API.**
Descartadas: NextAuth/Auth.js (pensado para multi-usuario y proveedores, sobra) y tabla de usuarios (no hay más de uno). Por qué: lo más simple que protege el panel. Si algún día es multi-usuario, se agrega tabla User y esta decisión se reemplaza.

**DEC-09. Tokens de Meta cifrados en DB (AES-256-GCM).**
Descartada: guardarlos en texto plano. Por qué: un dump de la DB no debe permitir publicar en las Páginas. Clave en `TOKEN_ENC_KEY` (32 bytes base64). Consecuencia: perder la clave obliga a reconectar Meta (no hay pérdida de datos de posts).

**DEC-10. API y worker como procesos separados del mismo proyecto Nest.**
Descartada: worker dentro del proceso HTTP. Por qué: un deploy o un pico en la API no corta publicaciones; se puede reiniciar uno sin el otro. En local se levantan los dos con un solo `npm run dev`.

## 11. Convenciones

Estructura:
```
social-publisher/
  apps/
    api/
      src/
        main.ts            # HTTP
        worker.ts          # tick + processors
        common/            # filtros, guards, decorators, utils
        modules/
          auth/ meta/ brands/ media/ posts/ publisher/ mail/ health/
            dto/           # class-validator
            *.controller.ts
            *.service.ts
            *.exceptions.ts
            *.spec.ts
      prisma/schema.prisma
      test/                # e2e
    web/
      app/                 # App Router
      components/
      lib/api/             # cliente fetch tipado
      lib/validations/     # zod (forms)
  CONSTRAINTS.md
  CLAUDE.md
  docs/SPEC-TECNICO.md
  docs/DECISIONES.md
```

Reglas (C12 equivalente en Nest/Next):
- Validación en DTOs con `class-validator` + `ValidationPipe` global (`whitelist`, `forbidNonWhitelisted`, `transform`)
- Controllers finos: reciben DTO, llaman al service, devuelven respuesta
- Lógica en `@Injectable()` services. Los services no reciben `Request`; reciben DTOs validados o parámetros tipados, para poder llamarlos desde el worker o tests
- Acceso a Meta solo a través de `MetaGraphClient`; a R2 solo a través de `StorageService`
- Escrituras múltiples en DB con `prisma.$transaction`
- Excepciones de negocio propias por módulo (`*.exceptions.ts`), mapeadas a HTTP en el filtro global
- Next: server components para leer, client components solo donde hay interacción (calendario, composer). Forms con react-hook-form + zod
- Nombres: archivos en kebab-case, clases en PascalCase, tablas Prisma en PascalCase singular con `@@map` a snake_case plural
- Fechas: UTC en API y DB; conversión a `America/Argentina/Tucuman` solo en la web (date-fns-tz)
- Nunca loguear tokens

### Design system (detalle fino con los skills de diseño en la etapa de UI)

- Base: shadcn/ui + Tailwind, modo claro y oscuro
- Tipografía: Inter (UI), números tabulares en calendario
- Color: neutros zinc; acento índigo; cada marca suma su color propio en chips del calendario. Estados: programado (azul), publicando (ámbar animado), publicado (verde), parcial (naranja), falló (rojo), borrador (gris)
- Componentes base: Button, Input, Textarea, Select, Dialog, Sheet (detalle lateral del post), Tabs (copy por red), Badge (estado), Calendar grid, Dropzone, Toast
- Movimiento: backoffice de uso diario, movimiento mínimo y con propósito: feedback de drag and drop, transición del Sheet, skeletons al cargar, pulso en estado "publicando". Respetar `prefers-reduced-motion`

## 11b. Barra de calidad (va a CONSTRAINTS.md)

| Chequeo | Comando | Cuándo |
|---------|---------|--------|
| Formato | `npx prettier --check <archivos>` | Cada cambio, archivos tocados |
| Lint | `npx eslint <archivos>` | Cada cambio, archivos tocados |
| Typecheck | `npm run typecheck -w apps/api` / `-w apps/web` (`tsc --noEmit`) | Cada cambio en ese workspace |
| Test del módulo | `npm test -w apps/api -- src/modules/<modulo>` | Cada cambio (D4) |
| Suite completa | `npm test -w apps/api && npm run test:e2e -w apps/api` | Cierre de etapa en init, antes de deploy |
| Build | `npm run build -w apps/api && npm run build -w apps/web` | Antes de deploy o si se toca config de build |

Umbrales:
- Formato, lint y typecheck: 0 errores en archivos tocados
- TypeScript `strict: true` en ambos workspaces
- Tests del módulo tocado en verde; tests contra DB `social_publisher_test` (nunca la de desarrollo), `.env.test`
- Las llamadas a Meta y R2 se mockean en tests (nunca se publica de verdad desde un test)
- Sin dependencias nuevas fuera de las del spec sin OK del autor

Prohibido para llegar a verde: lo de la plantilla de calidad del proyecto (`eslint-disable`, `@ts-ignore`, `.skip`, `.only`, bajar reglas, excluir archivos, `--no-verify`, catch vacío, debilitar asserts).

## 12. Plan de etapas

| # | Etapa | Contenido | Depende de |
|---|-------|-----------|------------|
| 0 | Scaffold | Monorepo npm workspaces, `nest new` en apps/api, `create-next-app` en apps/web, scripts para crear las DBs locales `social_publisher` y `social_publisher_test` (Postgres nativo, sin Docker), Prisma inicial, config con zod, prettier/eslint/tsconfig strict, filtro de errores con mail + test, `/health` + test de humo, README (incluye checklist de Meta), CLAUDE.md, CONSTRAINTS.md, docs/DECISIONES.md (DEC-01 a DEC-10), APRENDIZAJE-social-publisher.md | - |
| 1 | Auth | Login admin, JWT cookie, guard global, `/auth/me`, logout | 0 |
| 2 | Modelo + marcas | Schema Prisma completo y migración, módulo crypto, CRUD de Brand, asignación de SocialAccount a Brand | 1 |
| 3 | Conexión Meta | OAuth con `state`, canje token largo, sync de Páginas e IG, `MetaGraphClient` con mapeo de errores, estado de conexión. Validar acá que la app en Live con Standard Access obtiene los permisos | 2 |
| 4 | Media | Upload multipart del original (hasta 10 archivos, 20 MB c/u, jpg/png/webp), StorageService R2, `ImageProcessor` sharp (proporción + CROP/PAD), endpoint de preview | 2 |
| 5 | Posts | CRUD, targets, validaciones de negocio, generación de PostMedia procesada, derivación de estado, query calendario por rango y marca, reprogramar, cancelar, publicar ahora, reintentar | 2, 4 |
| 6 | Publisher | worker.ts, tick con SKIP LOCKED y recuperación de colgados (QUEUED / PUBLISHING), cola publish, processor FB (único y carrusel), processor IG (único y carrusel, poll de FINISHED, igContainerId), reintentos con backoff y regla de límite diario, avisos por mail, PublishAttempt | 3, 5 |
| 7 | Web: base | Layout, login, cliente API, settings Meta, settings marcas (aplicar skills de diseño C6) | 1, 2, 3 |
| 8 | Web: composer | Dropzone, reordenar, modo crop/pad, copy + tabs por red, contador, preview IG/FB, fecha/hora, acciones | 4, 5, 7 |
| 9 | Web: calendario y detalle | Vista mes/semana, chips por marca/estado, drag para reprogramar, filtro, Sheet de detalle con intentos y reintentar | 5, 6, 8 |
| 10 | Prueba punta a punta | Publicación real en una Página y un IG (manual, hecha por el autor), verificar visibilidad desde una cuenta sin rol en la app, ajustes | 6, 9 |
| 11 | IA para copy y hashtags | Modulo `ai` (`AiClient` unico acceso al modelo, `POST /ai/suggest-copy`: marca + idea corta + red -> 2 o 3 variantes de copy con hashtags, usando hashtags y firma de la marca como contexto). Boton "Sugerir con IA" en el composer que solo rellena el copy base (nunca publica). Key en `.env`, tests con el modelo mockeado, limite de uso por minuto | 8, 10 |
| 12 | Threads y mas redes | Primera red nueva: Threads (host `graph.threads.com`, OAuth propio con `threads_basic` y `threads_content_publish`, token de 60 dias con job de renovacion, publicacion en dos pasos, texto de hasta 500 caracteres, imagen o carrusel por URL publica de R2, limite diario propio). Antes de Threads se generaliza el publisher a un contrato por red (conexion, publicacion, limites de texto e imagen, renovacion de token) para que cada red siguiente sea un modulo nuevo sin tocar el tick ni la cola. Las demas redes se agregan despues con el mismo contrato, una por sub-etapa (12a Threads, 12b en adelante a definir) | 6, 8, 10 |

Después: deploy al VPS (Docker Compose o PM2 + Nginx, HTTPS, redirect URI de producción).

## 13. Preguntas abiertas

Respondidas 2026-11-16: spec aprobado; S5 Postgres confirmado; S6 sin Docker (ver S6); commits locales por etapa autorizados (sin push). Siguen abiertas 2, 7 y 8 (no bloquean el scaffold; 7 y 8 se necesitan en etapas 4 y 10). S1-S4 y S7-S11 se toman como confirmados por la aprobación.

1. ¿Confirmás solo imágenes en v1 (S1)?
2. Lista completa de marcas/apps y si alguna tiene una sola red (S2)
3. ¿Copy base + override por red, con hashtags y firma por marca (S3)?
4. ¿Login con un solo usuario en `.env` (S4)?
5. ¿Postgres + Prisma (S5) y tenés Docker en Windows (S6)?
6. ¿Autorizás commits locales por etapa terminada, sin push?
7. ¿Bucket R2 con dominio propio (ej. `media.tudominio.com`) o r2.dev?
8. ¿Tenés una URL de política de privacidad para poner la app de Meta en Live (puede ser una página simple en el sitio de cualquiera de tus apps)?
