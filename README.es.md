# Social Publisher

> 🇬🇧 [English](README.md) · 🇦🇷 Español

Panel web personal para **programar y publicar posts con imagen** en Páginas de Facebook, Instagram Business/Creator y Threads, usando la API oficial de Meta. Un solo usuario, tus propias cuentas, tu propia infraestructura: nada de terceros en el medio.

Proyecto de portfolio, hecho para aprender y para usarlo de verdad.

## Qué hace

- **Calendario** de posts programados, publicados y con error, con vista de detalle
- **Composer**: varias imágenes (carrusel), copy por red, fecha y hora de publicación
- **Marcas**: agrupan las cuentas de cada negocio, con hashtags y firma propios
- **Publicación automática** en el horario elegido, con reintentos y aviso por mail si falla
- **Facebook, Instagram y Threads** (el código está armado por red, para sumar otras)
- **IA opcional** (Claude) que sugiere copy y hashtags a partir de la imagen
- Web adaptada a celular

## Stack

| Parte | Tecnología |
|-------|------------|
| API | NestJS 12, Prisma 7, PostgreSQL, BullMQ + Redis, Vitest |
| Web | Next.js 16 (App Router), Tailwind |
| Imágenes | Cloudflare R2 (compatible con S3) |
| Redes | Meta Graph API y Threads API |

Monorepo con npm workspaces: `apps/api` (API + worker que publica) y `apps/web`. Spec y decisiones de diseño en [`docs/`](docs/).

---

## Inicio rápido con Docker (recomendado)

La forma más rápida: Postgres, Redis, la API, el worker y la web corren en contenedores. Solo necesitás [Docker](https://docs.docker.com/get-docker/) (Docker Desktop en Windows/macOS) y git.

```bash
git clone <url-del-repo>
cd social-publisher

# 1. Crear tu .env: genera las claves secretas y te pide el mail y la contraseña para entrar
docker compose run --rm init

# 2. Abrir .env y completar lo que todavía dice CAMBIAR: SMTP, Meta y R2
#    (cuentas y claves: pasos 5 y 6 del tutorial manual de abajo)

# 3. Construir y levantar todo
docker compose up -d --build
```

Abrí http://localhost:3000 y entrá con el mail y la contraseña del paso 1.

| Tarea | Comando |
|-------|---------|
| Ver logs (el worker es el que publica) | `docker compose logs -f worker api` |
| Parar (los datos se conservan) | `docker compose down` |
| Actualizar después de un `git pull` | `docker compose up -d --build` |
| Borrar todo, incluida la base de datos | `docker compose down -v` |

Notas:

- La primera vez, `docker compose run --rm init` descarga y prepara una imagen chica; el primer `up --build` compila todo y tarda unos minutos. Las siguientes son rápidas.
- Los puertos 3000 (web) y 3001 (API) tienen que estar libres. Para cambiarlos, editá `WEB_PORT` y `API_PORT` en `.env` y reconstruí (`docker compose up -d --build`): la dirección de la web, la de la API y la redirect URI de Meta los siguen solas. Acordate de registrar la nueva redirect URI en tu app de Meta. La dirección de la API queda incrustada en la imagen de la web al compilar, por eso hay que reconstruir.
- La web y la API escuchan solo en `127.0.0.1`: no se alcanzan desde otras máquinas. Postgres y Redis no se exponen.
- Los contenedores corren sin root y en modo producción, cuyas cookies de sesión son `Secure`. Chrome, Edge y Firefox las aceptan en `localhost`; Safari no por HTTP plano. Para usarlo desde otra máquina, ponelo detrás de un proxy con HTTPS (Caddy, Nginx) y poné tus dominios reales en `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` y `META_REDIRECT_URI` en `.env` (las líneas comentadas de `.env.example`).
- Sin los valores de Meta y R2 podés entrar y mirar, pero no conectar cuentas ni subir imágenes.

## Instalación manual (sin Docker)

¿Preferís correrlo nativo, o querés tocar el código? Seguí este tutorial. Los pasos 5 y 6 también hacen falta con Docker.

Vas a necesitar crear cuentas en algunos servicios. Todos tienen plan gratuito suficiente para uso personal. Calculá una hora la primera vez, casi toda en la app de Meta.

### 1. Qué necesitás antes de empezar

| Qué | Para qué | Obligatorio |
|-----|----------|-------------|
| Node 22+ y npm 12 | correr el proyecto | Sí |
| PostgreSQL 16+ | guardar posts, marcas y conexiones | Sí |
| Redis 6.2+ | cola de publicación | Sí |
| Cuenta de [Meta for Developers](https://developers.facebook.com) | permiso para publicar en FB e IG | Sí |
| Una Página de Facebook (y opcional: un Instagram Business/Creator vinculado a ella) | donde se publica | Sí |
| Cuenta de [Cloudflare](https://dash.cloudflare.com) con R2 | guardar las imágenes con URL pública (Meta las descarga de ahí) | Sí |
| Un servidor SMTP (Gmail con contraseña de aplicación, Mailtrap, Resend, etc.) | avisos de error y de publicación | Sí |
| App de Threads en Meta | publicar en Threads | No |
| Clave de [Anthropic](https://console.anthropic.com) | botón "Sugerir con IA" | No |

> **Redis en Windows:** no hay versión oficial. Usá Redis en WSL, [Memurai](https://www.memurai.com) o Docker (`docker run -p 6379:6379 redis:8`). En Linux y macOS, el paquete de tu sistema.

### 2. Instalar

```bash
git clone <url-del-repo>
cd social-publisher
npx npm@latest install
```

> Se usa `npx npm@latest` porque npm 11.4.1 falla con un bug de arborist en monorepos. Con npm 12 en adelante, `npm install` común funciona.

### 3. Crear las bases de datos

En Postgres, creá una base para desarrollo y otra para los tests:

```sql
CREATE DATABASE social_publisher;
CREATE DATABASE social_publisher_test;
```

### 4. Configurar el entorno

```bash
cp apps/api/.env.example apps/api/.env
cp apps/api/.env.example apps/api/.env.test
cp apps/web/.env.example apps/web/.env.local
```

(En Windows PowerShell: `Copy-Item` en lugar de `cp`.)

Abrí `apps/api/.env` y completá cada `CAMBIAR`. El archivo trae comentarios; acá el detalle de lo que no es obvio:

| Variable | Cómo conseguirla |
|----------|------------------|
| `DATABASE_URL` | Tu usuario y contraseña de Postgres |
| `REDIS_URL` | `redis://localhost:6379/0` si usás el puerto por defecto |
| `ADMIN_EMAIL` | El mail con el que vas a entrar al panel |
| `ADMIN_PASSWORD_HASH` | Corré `npm run hash-password`, escribí tu contraseña (mínimo 12 caracteres) y pegá el resultado **entre comillas simples** |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `TOKEN_ENC_KEY` | `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. **No la cambies después**: los tokens guardados dejarían de poder leerse |
| `META_*` | Ver paso 5 |
| `R2_*` | Ver paso 6 |
| `SMTP_*` | Los datos de tu proveedor de mail |

En `apps/api/.env.test` usá la base `social_publisher_test` y `/1` al final de `REDIS_URL`, para que los tests nunca toquen tus datos.

### 5. Crear la app de Meta (Facebook e Instagram)

Es el paso más largo. En [developers.facebook.com](https://developers.facebook.com):

1. **Crear app** de tipo **Business** y agregar el producto **Facebook Login for Business**
2. Permisos a solicitar: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
3. En **Configuración > Básica**: copiá el *ID de la app* y la *clave secreta* a `META_APP_ID` y `META_APP_SECRET`
4. En el login de Facebook, agregá la **URI de redirección** `http://localhost:3001/meta/callback`. Tiene que ser **idéntica** a `META_REDIRECT_URI` del `.env`
5. Tu Instagram tiene que ser **Business o Creator** y estar **vinculado a una Página de Facebook**
6. Para publicar sin pasar por App Review: pasá la app a modo **Live** con *Standard Access*. Meta te pide URL de política de privacidad, icono, categoría e instrucciones de borrado de datos (con páginas simples tuyas alcanza). Con Standard Access **solo podés publicar en cuentas donde vos tenés rol en la app**, que es justo el caso de uso personal

### 6. Crear el bucket de imágenes (Cloudflare R2)

1. En Cloudflare: **R2 > Create bucket**
2. En el bucket: **Settings > Public access** y habilitá el dominio `r2.dev` (o conectá uno propio). Copiá la URL pública a `R2_PUBLIC_BASE_URL` (sin barra final)
3. **R2 > Manage API tokens > Create API token**, con permiso de *Object Read & Write* sobre ese bucket. Copiá *Access Key ID* y *Secret* a `R2_ACCESS_KEY_ID` y `R2_SECRET_ACCESS_KEY`
4. `R2_ACCOUNT_ID` está en la barra lateral de R2, y `R2_BUCKET` es el nombre del bucket

> El bucket tiene que ser público porque Instagram y Facebook descargan la imagen desde su URL. Por eso la app borra los metadatos EXIF/GPS del original antes de subirlo.

### 7. Aplicar las migraciones

```bash
npm run db:deploy -w apps/api
```

### 8. Levantar todo

```bash
npm run dev
```

- Web: http://localhost:3000 (entrá con `ADMIN_EMAIL` y tu contraseña)
- API: http://localhost:3001 (`GET /health` para verificar)
- También arranca el **worker**, que es el que publica en el horario programado

### 9. Primer uso

1. **Marcas**: creá una marca (nombre, hashtags y firma opcionales)
2. **Meta**: conectá tu cuenta de Facebook. La app trae tus Páginas y los Instagram vinculados
3. En **Marcas**, asigná cada cuenta a su marca
4. **Nuevo post**: elegí la marca, subí la imagen, escribí el copy, marcá las redes y la fecha. Programalo
5. El calendario muestra el estado; si algo falla, te llega un mail y el detalle del error queda en el post

---

## Threads (opcional)

Threads tiene login propio: no usa el de Facebook.

1. En la misma app de Meta, agregá el caso de uso **Acceder a la API de Threads**
2. Permisos: `threads_basic` y `threads_content_publish`
3. **Configuración > Básica**: copiá el *Identificador de la app de Threads* y la *Clave secreta de Threads* (son distintos a los de Meta)
4. **Redirect URI** de Threads: `http://localhost:3001/threads/callback`
5. **Roles de la app > Evaluadores de Threads**: agregá tu perfil y aceptá la invitación desde Threads (Ajustes > Cuenta > Permisos del sitio web). Sin App Review solo se publica en perfiles evaluadores
6. En `apps/api/.env`, descomentá y completá `THREADS_APP_ID`, `THREADS_APP_SECRET` y `THREADS_REDIRECT_URI` (los tres juntos)
7. Conectá desde la web, en **Threads**. El token dura 60 días y el worker lo renueva solo; si un perfil pasa a "Hay que reconectar", se conecta de nuevo

## IA para el copy (opcional)

Poné `ANTHROPIC_API_KEY` en `apps/api/.env`. En el composer aparece "Sugerir con IA": genera 2 o 3 variantes de copy con hashtags según la marca y la imagen. Sin la clave, el botón responde que no está configurado y el resto funciona igual.

## Problemas comunes

| Síntoma | Causa probable |
|---------|----------------|
| La API no arranca y lista variables inválidas | Falta completar algún `CAMBIAR` en `.env`, o `ADMIN_PASSWORD_HASH` sin comillas simples (el `$` lo rompe) |
| `redirect_uri` inválida al conectar Meta | La URI de la app de Meta no es idéntica a `META_REDIRECT_URI` |
| El post queda "programado" y no sale | El worker no está corriendo, o Redis no responde |
| Instagram rechaza la imagen | La URL de R2 no es pública, o la imagen no cumple las proporciones que IG acepta |
| No aparece mi cuenta de Instagram | No es Business/Creator, o no está vinculada a una Página |
| Meta dice que no tenés permiso | La app no está en modo Live, o tu usuario no tiene rol en la app |
| `docker compose up --build` falla con un error inesperado (código 1, 137 o 146) | A Docker le falta RAM para compilar la API y la web juntas (2 GB no alcanza). Dale 4 GB o más, o construí de a uno: `COMPOSE_PARALLEL_LIMIT=1 docker compose build` |
| El servicio `migrate` falla con "Authentication failed" | El volumen de Postgres se creó con otro `POSTGRES_PASSWORD` (borraste y regeneraste el `.env`). Borralo con `docker compose down -v` (esto borra la base de datos) |

## Comandos

| Comando | Qué hace |
|---------|----------|
| `npm run dev` | API, worker y web juntos |
| `npm test -w apps/api` | tests unitarios |
| `npm run test:e2e -w apps/api` | tests de integración (usan la base `_test`) |
| `npm run typecheck` | tipos de API y web |
| `npm run lint` | linter |
| `npm run test:scripts` | tests del asistente del .env de Docker |
| `npm run hash-password` | genera el hash de tu contraseña |

Las llamadas a Meta y a R2 están mockeadas en los tests: ninguno publica de verdad. Más sobre la barra de calidad en [`CONSTRAINTS.md`](CONSTRAINTS.md).

## Seguridad

- Un solo usuario; la contraseña se guarda como hash bcrypt y la sesión va en una cookie `httpOnly`
- Los tokens de Meta se cifran con AES-256 en la base de datos y nunca se loguean
- Nunca subas tu `.env`: el `.gitignore` ya lo excluye

## Desplegar en un servidor

Está pensado para correr en un VPS (PM2 o Docker + Nginx con HTTPS). Al pasar a producción cambiá `WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` y las dos Redirect URI (Meta y Threads) a tus dominios reales.

## Licencia

[MIT](LICENSE)
