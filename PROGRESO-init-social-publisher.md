# Progreso: init social-publisher

## Etapas

- [COMPLETA] Etapa 0: Scaffold (commit: 55eee00; codigo, tests y chequeos OK; code-review corrido y 8 de 10 findings arreglados; /security-review NO corrido: falla sin remoto origin ni commits previos; verificado a mano: /health 200 con Postgres 18 y Redis 8 reales, el worker arranca sin errores; sin commit)
- [COMPLETA] Etapa 1: Auth (login con cookie JWT httpOnly, guard global, /auth/me y logout, throttle de 5 fallos por 15 min; 53 tests unitarios y 13 e2e en verde; code-review y security-review corridos; commit: ver git log)
- [COMPLETA] Etapa 2: Modelo + marcas (schema completo con migracion init_schema, CryptoService AES-256-GCM, CRUD de marcas, cuentas sociales sin exponer tokens; 81 tests unitarios y 28 e2e contra la DB de test en verde; code-review y security-review corridos; commit: 755002e)
- [COMPLETA] Etapa 3: Conexion Meta (OAuth con state firmado + cookie, canje a token largo, sync de Paginas e IG, MetaGraphClient con mapeo de errores, estado de conexion; 112 tests unitarios y 45 e2e con Meta mockeado en verde; code-review y security-review corridos; commit: 5e222d8)
- [COMPLETA] Etapa 4: Media (upload multipart de hasta 10 imagenes de 20 MB a R2, ImageProcessor con sharp, preview por proporcion y modo; 142 tests unitarios y 64 e2e con R2 en memoria en verde; code-review y security-review corridos; commit: 00b0f79)
- [COMPLETA] Etapa 5: Posts (CRUD de borradores con imagenes procesadas y destinos, programar/reprogramar, publicar ahora, cancelar, reintentar, eliminar, calendario por rango y marca, estado derivado; 157 tests unitarios y 106 e2e en verde; code-review y security-review corridos; commit: 1270475)
- [COMPLETA] Etapa 6: Publisher (tick cada minuto con SKIP LOCKED, rescate de QUEUED/PUBLISHING colgados, cola `publish`, publicacion FB e IG con imagen sola y carrusel, proteccion contra doble publicacion en IG, reintentos 1/5/15 min, regla de limite diario, avisos por mail, PublishAttempt; 157 tests unitarios y 135 e2e en verde; code-review y security-review corridos; commit: 030cdb0)
- [COMPLETA] Etapa 7: Web base (tokens y modo claro/oscuro, componentes propios, cliente API con cookie, proxy de sesion, login, shell con navegacion, ajustes de Meta y de marcas con cuentas; typecheck, lint y build limpios; probado en el navegador contra la API real; commit: 333e3ad)
- [PENDIENTE] Etapa 8: Web composer
- [PENDIENTE] Etapa 9: Web calendario y detalle
- [PENDIENTE] Etapa 10: Prueba punta a punta (manual con Matias)

## Decisiones tomadas sin el usuario

- El generador de Nest 12 trae Vitest y oxlint; se mantienen en lugar de Jest y ESLint del spec (api). La web usa ESLint de create-next-app. Confirmar con Matias; si acepta pasa a DECISIONES
- Prisma 7 con `@prisma/adapter-pg` y cliente generado en `apps/api/src/generated` (ignorado por git). `prisma generate` corre en `postinstall`
- Dependencias de etapa 0 fuera de la lista literal del spec, necesarias para ella: `zod`, `pg`, `@prisma/adapter-pg`, `@nestjs/bullmq`, `class-validator`, `class-transformer`, `nodemailer`
- Config con `process.loadEnvFile` (sin dotenv). Variables de SMTP son obligatorias desde ya
- `/health` usa la cola de mail para el ping a Redis (`getJobCounts`); el filtro global no reporta el 503 intencional
- `npm install` requiere npm 12 (bug de arborist en npm 11.4.1)
- Redis de desarrollo: 8.10.3 en WSL, puerto 6380 (probado OK con BullMQ). El de Laragon (5.0.14, puerto 6379) queda sin uso. Antes: Probado con BullMQ 6: jobs, delayed, reintentos con backoff y job scheduler (tick) funcionan; solo avisa que se recomienda 6.2+. Actualizar es opcional pero conviene por paridad con produccion
- BullMQ 6 trae `ioredis` como paquete opcional: sin instalarlo la app no conecta a Redis. Agregado como dependencia de la API (no lo detectaban los tests con mocks)

## Review etapa 0 (nivel 2)

- code-review (high): 10 findings. Arreglados: dev.mjs mata el arbol en Windows, throttle del reporter (se libera si falla el envio y la firma ignora el mensaje), NODE_ENV obligatorio, redact de tokens en JSON y `code=` solo en query, REDIS_URL con db invalida falla, el worker reporta uncaught/unhandled, tests nuevos de redis-connection y load-env-file
- Saltados a proposito: `postinstall: prisma generate` rompe `npm ci --omit=dev` (se resuelve en mazar-ship, generar en el build del deploy); `/health` pinguea Redis por la cola de mail (se unifica en la etapa 6 con la cola publish)
- /security-review: no corrio. Su plantilla usa `origin/HEAD...` y no hay remoto ni historia. Pendiente decidir como cubrirlo

## Etapa 1: decisiones y notas

- `bcryptjs` (JS puro) en lugar de `bcrypt` nativo: npm 12 bloquea scripts de instalacion y en Windows habria que compilar. Tambien `@nestjs/jwt` y `cookie-parser`
- Para que /security-review corra sin remoto se creo la referencia local `refs/remotes/origin/main` (y `origin/HEAD`) apuntando al commit de la etapa 0. Al agregar el remoto real, reemplazarla
- Review etapa 1: security-review sin hallazgos; code-review con 6 hallazgos, 4 arreglados. Quedan para el deploy (mazar-ship): configurar `trust proxy` en Express (sin eso el throttle de login usa la IP del proxy y cualquiera podria bloquear al admin) y, opcional, header `Retry-After` en el 429
- Fix posterior (review automatico de seguridad): el intento de login se cuenta antes de esperar a bcrypt (cierra la carrera con peticiones en paralelo) y el mapa de IPs tiene tope duro de 1000 claves. Sin revisar de nuevo con los dos skills: cambio chico y acotado, cubierto por tests nuevos
- Segundo aviso automatico de seguridad: el tope de 1000 claves permite a un atacante con muchas IPs reiniciar su contador. Decision de Matias: agrupar IPv6 por /64 (`clientKeyFromIp`) y NO agregar limite global por cuenta (permitiria bloquear el login al admin a proposito). Defensa de fondo: contrasena de 12+ caracteres y bcrypt costo 12
- Logout solo borra la cookie: no hay revocacion de token (vence a los 7 dias)
- Variables nuevas obligatorias: `ADMIN_PASSWORD_HASH` (generar con `npm run hash-password`), `JWT_SECRET` (32 caracteres o mas) y `WEB_ORIGIN` (origen exacto, sin barra final)

## Etapa 2: decisiones y notas

- Variable nueva obligatoria: `TOKEN_ENC_KEY` (32 bytes en base64). Generar con `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Si se cambia, los tokens ya guardados dejan de descifrarse
- Migraciones a la base de test: `node scripts/prisma-test.mjs migrate deploy` (carga `.env.test`)
- Los e2e con DB (`test/brands.e2e-spec.ts`) se niegan a correr si la base no termina en `_test` y vacian todas las tablas entre tests
- `DELETE /brands/:id` responde 409 si la marca tiene posts (se desactiva en su lugar); las cuentas asignadas quedan sin marca
- Una cuenta social solo se lista y se asigna a marcas; se crean al sincronizar con Meta (etapa 3). La respuesta usa lista blanca de campos: nunca `pageTokenEnc`
- Review etapa 2: security-review sin hallazgos; code-review con 1 hallazgo (carrera en el borrado de marca, P2003 -> 409), arreglado con test. Sin dependencias nuevas
- Filtro de cuentas: `unassigned=true` pisa a `brandId` si llegan los dos (no se valida la combinacion)

## Etapa 3: decisiones y notas

- Variables nuevas obligatorias: `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION` (ej. v24.0), `META_REDIRECT_URI`
- Rutas: `GET /meta/status`, `GET /meta/connect-url` (devuelve la URL de Facebook y setea la cookie del state), `POST /meta/sync`, `GET /meta/callback` (publica, protegida por state + cookie; redirige a `WEB_ORIGIN/settings/meta?status=ok|denied|error|permissions`)
- Los e2e ahora corren de a un archivo (`fileParallelism: false`) porque comparten la base de test
- Error 190 durante el sync marca la conexion INVALID y encola mail al admin; errores transitorios de Meta responden 503 (no se reportan por mail)
- Tokens: token de usuario largo cifrado en MetaConnection; token de Pagina cifrado en la cuenta FB; la cuenta IG usa el de su Pagina (`MetaService.tokenForAccount`)
- No se agrego ninguna dependencia nueva
- Review etapa 3: security-review sin hallazgos; code-review con 2: error transitorio daba 500 (arreglado), y una lista vacia de Meta desactiva todas las cuentas (saltado a proposito: se recupera con otro sync)
- Pendiente de validar con la app real de Meta (no se puede automatizar): que en modo Live con Standard Access se concedan los 6 permisos. El sync devuelve `missingPermissions` y el callback vuelve con `status=permissions` si falta alguno
- Los subcodes de IG transitorios usan la lista del spec; confirmar contra la doc vigente de errores de IG en la etapa 6/10

## Etapa 4: decisiones y notas

- Dependencias nuevas (ya en docs/STACK-Y-PAQUETES.md): `sharp`, `@aws-sdk/client-s3`, `@types/multer`. Sin scripts de instalacion: sharp usa binarios precompilados
- Variables nuevas obligatorias: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (sin barra final)
- Rutas: `POST /media` (campo `files`), `GET /media/:id`, `GET /media/:id/preview?aspectRatio=&fitMode=&padColor=` (JPEG al vuelo, no guarda nada)
- Subida todo o nada: se valida todo antes de guardar; si R2 o la DB fallan a mitad, se borra lo ya subido. Fallos de R2 responden 503 (no se reportan por mail)
- La extension y el mime salen del contenido real (jpeg/png/webp), nunca del nombre. El nombre se limpia solo para mostrarlo
- Un archivo de mas de 20 MB responde 413 con el mensaje en ingles de multer ("File too large"); la web (etapa 8) debe mostrar su propio texto segun el status. Por eso no existe `ImageTooLargeException` del spec
- Limite de 100 millones de pixeles por imagen (proteccion contra bombas de descompresion)
- La generacion de `PostMedia` (version procesada guardada en `processed/...`) es de la etapa 5: usara `ImageProcessor.process` y `StorageService.put`
- Verificado con R2 en memoria. Falta probar contra un bucket real (credenciales de Matias) y que Meta descargue la URL publica: queda para la etapa 10
- Review etapa 4: security-review sin hallazgos; code-review con 1 (excepcion sin uso), arreglado
- Aviso automatico posterior (EXIF/GPS en originales publicos): decision de Matias, opcion 1. El original se re-codifica sin metadatos al subir (`ImageProcessor.stripMetadata`: mismo formato, calidad 95 en JPEG/WebP, rotacion aplicada a los pixeles, pasa a sRGB). `sizeBytes` es el del archivo guardado. Ya no se guarda el archivo byte a byte igual al subido

## Etapa 5: decisiones y notas

- Rutas: `GET /posts?from=&to=[&brandId=&status=]` (rango maximo 100 dias; sin rango hace falta `status`), `GET /posts/:id`, `POST /posts` (siempre crea un BORRADOR), `PATCH /posts/:id`, `POST /posts/:id/schedule` (programa o reprograma), `/publish-now`, `/cancel`, `/retry`, `DELETE /posts/:id`
- Fechas siempre en ISO 8601 UTC. La zona horaria se resuelve en la web (etapa 8)
- Editable: solo DRAFT y SCHEDULED, y solo si ningun destino salio de PENDING (guarda dentro de la transaccion). La marca de un post no se cambia
- Las imagenes procesadas (`processed/yyyy/mm/uuid.jpg`) se generan al crear o al cambiar imagenes, proporcion o modo, y se borran de R2 al regenerar o eliminar. PAD rellena siempre con blanco (el color de marca queda como mejora)
- Reglas: 1 a 10 imagenes sin repetir, cuentas activas de la misma marca sin repetir, texto de Instagram hasta 2200 caracteres (cuenta emojis como 1; el override de la cuenta manda). Para programar hacen falta al menos una imagen, una cuenta y fecha futura
- `PostsService.recomputeStatus(postId, tx?)` es lo que usara el publicador despues de cada cambio de un destino (DEC-07). Regla agregada: pendiente + algun publicado o fallido = PUBLISHING (no esta en el spec)
- Cancelar revisa que no haya destinos en curso, pero no es atomico con el tick. El processor de la etapa 6 DEBE volver a leer el estado del post y no publicar si esta CANCELLED
- Un post CANCELLED no vuelve a abrirse; hay que crear otro (se puede agregar "duplicar" despues)
- No hay dependencias nuevas
- Review etapa 5: security-review sin hallazgos; code-review con 2: edicion pisando un destino ya encolado (arreglado) y cancelar no atomico (saltado, ver nota del publicador)

## Etapa 6: decisiones y notas

- Dos colas: `tick` (job repetible cada minuto, `upsertJobScheduler`, idempotente al reiniciar el worker) y `publish` (un job por destino, `jobId = {targetId}-{attempts}`, concurrencia 3). Todo vive en `apps/api/src/modules/publisher/`, solo cargado por el worker
- `attempts` cuenta intentos fallidos consumidos. Pasajero: PENDING con espera de 1, 5 y 15 min; el 4to fallo deja FAILED. Limite diario de IG no gasta intentos: reintenta cada hora y falla a las 24 h
- Cambio de esquema (migracion `daily_limit_since`): `PostTarget.dailyLimitSince` marca el primer rechazo por limite diario. Se limpia al publicar o fallar, asi un "Reintentar" de la UI arranca una racha nueva
- Facebook: si no hay respuesta (timeout o red caida) al llamar a la que publica, el destino queda FAILED con "Revisá manualmente en la Página" y mail; no se reintenta porque podria duplicar. Errores con respuesta clara si se reintentan segun la tabla. Subir fotos sin publicar (carrusel) si se repite sin riesgo
- Instagram: el container padre se guarda apenas se crea. En un reintento se consulta su `status_code`: PUBLISHED busca el post entre los ultimos 10 por texto y fecha (si no aparece queda PUBLISHED sin link y avisa por mail), FINISHED solo publica, IN_PROGRESS espera, ERROR o EXPIRED crean uno nuevo. Espera de FINISHED: cada 3 s hasta 60 s por container
- Destino colgado: QUEUED mas de 5 min vuelve a PENDING sin gastar intento. PUBLISHING mas de 15 min: FB pasa a FAILED con aviso; IG gasta un intento y se reintenta
- Antes de publicar el processor toma el destino con un `updateMany` que exige QUEUED y post no cancelado ni borrador: si el post se cancelo entre el tick y el worker, el destino vuelve a PENDING sin publicar
- Sin conexion Meta activa o cuenta desactivada: FAILED directo con mensaje claro (el usuario reintenta tras reconectar). Codigo 190 de Meta marca la conexion INVALID y manda el mail de reconexion (`MetaService.markCurrentConnectionInvalid`)
- Error inesperado dentro de un intento: se trata como pasajero y se reporta al admin. Si el job entero falla, `PublishProcessor` lo reporta y el tick rescata el destino
- El health ahora prueba Redis con la cola `publish`
- No hay dependencias nuevas
- Review etapa 6: security-review sin hallazgos (sin endpoints ni inputs nuevos); code-review con 2: fallos de job sin reportar (arreglado) y una consulta de conexion por destino (saltado)
- Falta probar con Meta real: orden de errores de IG y tiempos de procesamiento de containers (etapa 10)

## Etapa 7: decisiones y notas

- Sin shadcn/ui por CLI: componentes escritos a mano (Button, Field/Input/Select/Textarea, Badge, Toast, ConfirmDialog con `<dialog>` nativo) en `apps/web/components/ui`, con los tokens zinc + indigo del spec en `globals.css` (claro y oscuro con `prefers-color-scheme`). Tipografia Inter como pide el spec. Paquetes nuevos: react-hook-form, zod, @hookform/resolvers y lucide-react (los tres primeros salen del spec; lucide es el set de iconos de shadcn)
- Las skills de diseno: se uso `frontend-design`. `design-taste-frontend` esta pensada para landings y deja fuera dashboards y paneles, asi que solo se aplicaron sus chequeos de contraste, estados vacios/error/carga y consistencia. `emil-design-eng` no se consulto: el movimiento es minimo (toast, feedback de click) y respeta `prefers-reduced-motion`
- Sesion: `proxy.ts` solo revisa que exista la cookie `sp_session` (chequeo optimista, la API decide). Un 401 en cualquier llamada lleva a `/login` por el router de Next (`setUnauthorizedHandler`, lo registra el menu)
- Datos: `lib/api/client.ts` (fetch con `credentials: include`, errores de Nest con texto o lista, 413 de multer traducido), `lib/api/resources.ts` (tipos y llamadas) y `lib/use-api-data.ts`. Las pantallas de ajustes son client components, como pide el spec para lo interactivo
- Meta: la web pide `GET /meta/connect-url` y navega a esa URL. Vuelve a `/settings/meta?status=ok|permissions|denied|error` y se muestra un aviso. `useSearchParams` va dentro de `Suspense` (cacheComponents)
- Marcas: alta, edicion y baja (con confirmacion; la API devuelve 409 si ya tiene posts). Cuentas sociales con select para asignar marca o dejarlas sin marca
- Para produccion: la cookie de sesion la pone la API, asi que web y API tienen que compartir dominio padre (ej. `app.dominio.com` y `api.dominio.com`) y `NEXT_PUBLIC_API_URL` apuntar a la API. En local sirve porque cookies no distinguen puertos
- No hay tests automaticos de la web: el spec no incluye un runner para `apps/web` y agregar Vitest seria una dependencia fuera del spec (CONSTRAINTS). Se probo a mano en el navegador: validacion del login, credenciales incorrectas, login correcto, redireccion sin sesion, crear y eliminar marca, aviso de Meta. Si queres tests de componentes, es una decision tuya
- No se pudo probar con Meta real ni con cuentas sincronizadas (la lista de cuentas se vio vacia); el selector de marca por cuenta quedo sin probar en vivo
- Al probar con la API se vio que el Redis de este equipo en el puerto 6380 pide contrasena (`NOAUTH`) y `REDIS_URL` no la trae: sin eso la API no puede encolar mails ni el worker consumir. Hay que revisar la config de Redis o agregar la contrasena a `REDIS_URL`. El `.env` de la API todavia no tiene las variables listadas abajo (se probo con valores descartables en memoria, sin tocar tus archivos)
- Review etapa 7: nivel 2 por tocar login. Sin hallazgos de seguridad (no guarda tokens en el navegador, la cookie es httpOnly de la API)

## Pendiente de Matias

- Agregar a `apps/api/.env`: `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `WEB_ORIGIN`, `TOKEN_ENC_KEY`, `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_VERSION`, `META_REDIRECT_URI`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL` (en `.env.test` solo hace falta `DATABASE_URL` para los e2e) (sin eso la API no arranca con tu .env)
- Preguntas abiertas 2, 7 y 8 del spec (marcas, dominio R2, URL de privacidad)

Ultima actualizacion: etapa 7 completa (web base)
