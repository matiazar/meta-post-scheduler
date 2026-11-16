# Progreso: init social-publisher

## Etapas

- [COMPLETA] Etapa 0: Scaffold (commit: 55eee00; codigo, tests y chequeos OK; code-review corrido y 8 de 10 findings arreglados; /security-review NO corrido: falla sin remoto origin ni commits previos; verificado a mano: /health 200 con Postgres 18 y Redis 8 reales, el worker arranca sin errores; sin commit)
- [COMPLETA] Etapa 1: Auth (login con cookie JWT httpOnly, guard global, /auth/me y logout, throttle de 5 fallos por 15 min; 53 tests unitarios y 13 e2e en verde; code-review y security-review corridos; commit: ver git log)
- [COMPLETA] Etapa 2: Modelo + marcas (schema completo con migracion init_schema, CryptoService AES-256-GCM, CRUD de marcas, cuentas sociales sin exponer tokens; 81 tests unitarios y 28 e2e contra la DB de test en verde; code-review y security-review corridos; commit: ver git log)
- [PENDIENTE] Etapa 3: Conexion Meta
- [PENDIENTE] Etapa 4: Media
- [PENDIENTE] Etapa 5: Posts
- [PENDIENTE] Etapa 6: Publisher
- [PENDIENTE] Etapa 7: Web base
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

## Pendiente de Matias

- Agregar a `apps/api/.env` y `.env.test`: `ADMIN_PASSWORD_HASH`, `JWT_SECRET`, `WEB_ORIGIN` y `TOKEN_ENC_KEY` (sin eso la API no arranca con tu .env)
- Preguntas abiertas 2, 7 y 8 del spec (marcas, dominio R2, URL de privacidad)

Ultima actualizacion: codigo de etapa 0 escrito, 18 tests unitarios y 2 e2e de humo en verde
