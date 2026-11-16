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

## Calidad

Ver `CONSTRAINTS.md`.
