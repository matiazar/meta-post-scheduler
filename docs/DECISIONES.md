# Decisiones: social-publisher

Registro de decisiones de arquitectura. Solo se agrega. Las decisiones que cambian se reemplazan, no se editan.

## DEC-001: NestJS + Next.js en monorepo con npm workspaces

Fecha: 2026-11-16
Estado: Vigente
Origen: spec tecnico (DEC-01)

Contexto: Panel interno de un solo usuario. el autor quiere aprender Node/Nest/Next.
Decision: `apps/api` (NestJS) y `apps/web` (Next.js) en un monorepo con npm workspaces.
Alternativa descartada: Laravel + Filament.
Por que: objetivo de aprendizaje, proyecto interno sin plazo.
Consecuencias: mas piezas armadas a mano (panel, auth). Laravel habria sido mas rapido.
Duda adversarial: corrio antes de aprobar el spec.

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
Origen: spec tecnico (DEC-03), confirmado por el autor en el kickoff

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
Decision: un solo login OAuth del autor; IG vinculado a Pagina; app en modo Live con Standard Access, sin App Review.
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

## DEC-011: IA para copy y hashtags como etapa 11, solo sugerencias

Fecha: 2026-11-16
Estado: Vigente
Origen: pedido del autor tras terminar la etapa 9

Contexto: el spec dejaba la IA fuera de la v1; el autor quiere ayuda para redactar copy y hashtags.
Decision: modulo `ai` con `AiClient` como unico acceso al modelo (igual que `MetaGraphClient` para Meta). El endpoint devuelve variantes y el composer las pone en el copy base; el usuario edita y publica. Va despues de la etapa 10, para no demorar la validacion del flujo de publicacion.
Alternativa descartada: generar y publicar sin revision humana.
Por que: un texto mal generado publicado solo en una Pagina real es un riesgo de marca.
Consecuencias: nueva variable de entorno con la API key (nunca logueada, usar `redact`), tests con el modelo mockeado, dependencia nueva a registrar en STACK-Y-PAQUETES.md.
Elegido al arrancar la etapa: proveedor Claude (Anthropic) con `@anthropic-ai/sdk`. El modelo lee las imagenes del post (achicadas a 1568 px, JPEG) mas la descripcion y el tono de la marca (campos nuevos `description` y `tone`), y devuelve 3 variantes con hashtags. Modelo por defecto `claude-sonnet-5-5`, configurable con `AI_MODEL` (Haiku sirve si se quiere gastar menos). `ANTHROPIC_API_KEY` es opcional: sin ella el endpoint responde 503 y el resto de la app sigue andando. Sin `fallbacks` del lado del servidor (simplificacion: si falla, el usuario reintenta). Maximo 4 imagenes por pedido y 10 pedidos por minuto.

## DEC-012: DNS con IPv4 primero en la API y el worker

Fecha: 2026-11-16
Estado: Vigente
Origen: etapa 10 (prueba real)

Contexto: en la red de desarrollo, Node intentaba IPv6 primero hacia graph.facebook.com y la conexion se colgaba 10 s (UND_ERR_CONNECT_TIMEOUT), aunque curl y el navegador andaban bien.
Decision: `src/common/ipv4-first.ts` llama a `dns.setDefaultResultOrder('ipv4first')` y se importa primero en `main.ts` y `worker.ts`. Solo reordena: IPv6 sigue disponible si no hay IPv4.
Alternativa descartada: `NODE_OPTIONS` en los scripts de npm (no funciona en cmd de Windows y hay que recordarlo en cada terminal).
Por que: se aplica igual en cualquier sistema y a todas las conexiones del proceso (Meta, R2, Postgres, Redis).
Consecuencias: si en produccion IPv6 anda bien se puede quitar sin otros cambios. El error de red de `MetaGraphClient` ahora incluye el codigo de la causa (ej. `(UND_ERR_CONNECT_TIMEOUT)`), sin URL ni token.

## DEC-013: Redes nuevas por etapa 12, con Threads primero y un contrato de publisher por red

Fecha: 2026-11-16
Estado: Vigente
Origen: pedido del autor durante la etapa 10

Contexto: el spec limitaba la v1 a Facebook e Instagram. el autor quiere sumar Threads y varias redes mas.
Decision: etapa 12 despues de la 10 y la 11. Primero se generaliza el publisher a un contrato por red (conexion, publicacion, limites, renovacion de token), despues se agrega Threads (12a) y el resto una por sub-etapa. Cada red tiene su propio cliente de acceso, igual que `MetaGraphClient`, y su propio OAuth y tokens cifrados (DEC-009).
Alternativa descartada: pegar cada red dentro de los publishers de FB e IG.
Por que: Threads usa otro host, otro login y tokens de 60 dias; las otras redes van a diferir todavia mas. Un contrato evita tocar el tick y la cola con cada red.
Consecuencias: el tipo de cuenta social pasa a admitir mas valores; el contador de caracteres y las reglas de imagen del composer dependen de la red; las redes de terceros (TikTok, X, LinkedIn) pueden exigir revision de app o plan de pago, a evaluar antes de cada sub-etapa. DEC-005 (una sola conexion Meta via Facebook Login) sigue valiendo solo para FB e IG.
Implementado (12 base + 12a Threads):
- Contrato `NetworkPublisher` (`publisher.types.ts`): `assertConnected`, `tokenFor`, `invalidateConnection`, `publish` y `onHung` (`fail` o `retry` para un destino colgado). `PublishService` recibe la lista de redes por el token `NETWORK_PUBLISHERS` y no conoce ninguna en particular; sumar una red es una clase nueva mas una linea en `publisher.module.ts`. FB e IG comparten la conexion de Meta en `MetaNetworkPublisher`.
- Limites de texto por red en `common/network-limits.ts` (FB sin tope, IG 2200, Threads 500 contando los emojis como bytes UTF-8); el calendario y el composer usan los mismos topes.
- Threads: host `graph.threads.com` (verificado en la doc, no `.net`), `ThreadsGraphClient` reutiliza el fetch y el mapeo de errores de `MetaGraphClient`. Una conexion por perfil (token largo cifrado, 60 dias; tabla unica desde DEC-014), porque cada marca puede tener su propio perfil; la cuenta social THREADS se crea al conectar. Variables `THREADS_APP_ID/SECRET/REDIRECT_URI` opcionales y todas o ninguna.
- El token se renueva en el worker: `TickProcessor` revisa una vez por hora y renueva los que vencen en menos de 15 dias y tienen mas de 24 h (limite de Threads). Un 190 deja la conexion INVALID y avisa por mail una sola vez; un fallo pasajero se reintenta a la hora siguiente.
- La columna `post_targets.igContainerId` la usan IG y Threads (proteccion contra doble publicacion con el mismo flujo de containers). No se renombro para no hacer una migracion de datos sin necesidad.
- Sin manejo especial del limite diario de Threads (250 posts por 24 h): para un panel de un solo usuario no se alcanza; si pasara, se reintenta como error pasajero y termina FAILED con aviso.
- La sincronizacion de Meta ya no desactiva cuentas de Threads (solo mira FB e IG).
- La IA suma la red THREADS (texto de hasta 400 caracteres y como maximo 1 hashtag), que el composer usa solo cuando todas las cuentas elegidas son de Threads.

## DEC-014: Una sola tabla de conexiones para todas las redes

Fecha: 2026-11-18
Estado: Vigente
Origen: pedido del autor al ver `meta_connections` y `threads_connections` (iba a haber una tabla por red: TikTok, X, Telegram)

- Una tabla `social_connections` (`provider`, `externalId`, `displayName`, `tokenEnc`, `refreshTokenEnc?`, `tokenExpiresAt?`, `tokenRefreshedAt?`, `status`, `lastSyncedAt?`, `data` JSON). Unica por `(provider, externalId)`. `data` es solo para lo propio de cada red: lo que se consulta va en columna.
- `SocialAccount.connectionId` (FK, SetNull) dice de que login sale cada cuenta; reemplaza la convencion de buscar por `externalId`.
- `ConnectionsService` (modulo `connections`) guarda, entrega el token descifrado, invalida y renueva igual para todas las redes. Invalidar es un UPDATE condicionado a ACTIVE: con rechazos en paralelo el aviso sale una sola vez. El texto del aviso sale de `CONNECTION_INFO` por red.
- Las redes que renuevan token registran un `ConnectionRefresher` (`refreshWhenLeftMs`, `minAgeMs`, `refresh`, `isTokenRejected`); hoy `ThreadsRefresher`. `TickProcessor` llama a `ConnectionsService.refreshDue()` una vez por hora. Meta (token que no se renueva) y Telegram (bot token que no vence) no registran ninguno.
- Sumar una red con login propio: un valor en `ConnectionProvider`, una entrada en `CONNECTION_INFO`, su servicio de OAuth y, si renueva, su refresher. Sin tablas nuevas.
- Migracion en dos pasos: A (`20261118120000_social_connections`) crea la tabla, copia los datos (tokens tal cual, misma `TOKEN_ENC_KEY`; de Meta solo la conexion mas reciente) y rellena `connectionId`; las tablas viejas quedan sin uso. B (`20261118130000_drop_old_connections`) borra `meta_connections` y `threads_connections`; el enum de estado ya quedo renombrado a `ConnectionStatus` en A.
