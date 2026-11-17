# social-publisher

Panel interno para programar y publicar posts con imagen en Paginas de Facebook e Instagram (Meta Graph API). Spec: `docs/SPEC-TECNICO.md`.

## Requisitos

- Node 22 o superior
- npm 12 (el npm 11.4.1 falla con un bug de arborist en este monorepo): `npx npm@latest install`
- PostgreSQL 16 o superior nativo, con las bases `social_publisher` y `social_publisher_test`
- Redis (BullMQ lo tolera desde 5.0; se recomienda 6.2 o superior. En Windows: Memurai o Redis en WSL)

## Puesta en marcha

```bash
npx npm@latest install
```

1. Crear las dos bases en Postgres: `CREATE DATABASE social_publisher;` y `CREATE DATABASE social_publisher_test;`
2. Copiar `apps/api/.env.example` a `apps/api/.env` y a `apps/api/.env.test` (en este ultimo usar la base `_test`) y completar las credenciales
3. Levantar todo:

```bash
npm run dev
```

API en http://localhost:3001 (`GET /health`), web en http://localhost:3000.

## Checklist de Meta (manual, en developers.facebook.com)

1. App tipo Business con el producto "Facebook Login for Business"
2. Permisos: `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, `business_management`
3. App en modo **Live** con Standard Access (sin App Review), Matias con rol admin. Meta pide URL de politica de privacidad, icono, categoria e instrucciones de borrado de datos
4. Redirect URI: `http://localhost:3001/meta/callback` (dev) y la de produccion despues
5. Cada IG Business/Creator vinculado a su Pagina
6. Copiar `META_APP_ID` y `META_APP_SECRET` (Configuracion > Basica) a `apps/api/.env`. `META_REDIRECT_URI` debe ser exactamente la Redirect URI del punto 4
7. Conectar: con sesion iniciada, `GET /meta/connect-url` devuelve la URL de Facebook (la web la abre en la etapa 7); al volver, el callback guarda la conexion y sincroniza las cuentas

## Checklist de Threads (manual, en developers.facebook.com)

Threads tiene login propio: no usa el de Facebook ni los permisos de Meta de arriba.

1. En la misma app de Meta, agregar el caso de uso **Acceder a la API de Threads**
2. Permisos: `threads_basic` y `threads_content_publish`
3. Configuracion > Basica: copiar el **Identificador de la app de Threads** y la **Clave secreta de Threads** (son distintos a los de Meta)
4. Redirect URI de Threads: `http://localhost:3001/threads/callback` (dev) y la de produccion despues
5. Roles de la app > Evaluadores de Threads: agregar cada perfil que se vaya a conectar y aceptar la invitacion desde Threads (Ajustes > Cuenta > Permisos del sitio web). Sin App Review solo se publica en perfiles evaluadores
6. En `apps/api/.env`: `THREADS_APP_ID`, `THREADS_APP_SECRET` y `THREADS_REDIRECT_URI` (los tres juntos, igual a la del punto 4)
7. Conectar desde la web en Threads (menu lateral). El token dura 60 dias y el worker lo renueva solo; si un perfil pasa a "Hay que reconectar", se conecta de nuevo

## Calidad

Ver `CONSTRAINTS.md`.
