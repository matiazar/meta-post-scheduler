# Que es cada cosa: stack y paquetes de social-publisher

Guia para entender que estamos usando y para que. Se actualiza cada vez que se instala un paquete nuevo. Para el detalle de por que se eligio cada pieza, ver `docs/DECISIONES.md`.

## El mapa general

```
Navegador (vos)
   |
   v
apps/web  (Next.js)          <- lo que ves: login, calendario, composer
   |  fetch con cookie
   v
apps/api  (NestJS)           <- la logica: recibe pedidos, guarda en la DB, habla con Meta
   |         \
   v          v
PostgreSQL    Redis          <- DB: datos | Redis: cola de tareas
                 ^
                 |
apps/api  (worker)           <- mismo codigo que la API, otro proceso: publica a la hora indicada
   |
   v
Meta (Facebook / Instagram), Cloudflare R2 (imagenes), SMTP (mails)
```

## Las tecnologias grandes

| Nombre | Que es | Parecido en tu mundo (Laravel) |
|--------|--------|-------------------------------|
| **Node.js** | El motor que ejecuta JavaScript fuera del navegador. Todo lo del proyecto corre sobre Node. No es un framework: es el "PHP" de este mundo | PHP |
| **npm** | El instalador de paquetes de Node. Lee `package.json` y baja las librerias a `node_modules/` | Composer |
| **npm workspaces** | Permite tener varios proyectos (`apps/api` y `apps/web`) en un mismo repo compartiendo un solo `node_modules` y un solo `npm install` | Un monorepo con un solo composer |
| **TypeScript** | JavaScript con tipos. Se chequea antes de ejecutar (`npm run typecheck`) y evita errores tontos. Se compila a JavaScript | Tipado de PHP 8, pero mucho mas estricto |
| **NestJS** | Framework de backend para Node. Organiza el codigo en modulos, controladores y servicios, con inyeccion de dependencias. Es nuestra API y el worker | Laravel (la parte de rutas, controllers, services, container) |
| **Next.js** | Framework de frontend basado en React. Arma las pantallas (paginas, componentes) y las sirve. En este proyecto no tiene logica de negocio: solo pantallas que le hablan a la API | Blade/Livewire/Inertia, pero con React |
| **React** | Libreria para construir interfaces con componentes reutilizables. Next.js se apoya en ella | Componentes de Livewire/Vue |
| **PostgreSQL** | La base de datos relacional donde se guardan marcas, posts, cuentas, etc. | MySQL |
| **Redis** | Base de datos en memoria, muy rapida. Aca la usamos solo como "bandeja" de la cola de tareas | El driver redis de las queues de Laravel |
| **Prisma** | ORM: define las tablas en `schema.prisma` y genera un cliente tipado para consultarlas desde TypeScript. Maneja las migraciones | Eloquent + migraciones |
| **BullMQ** | Sistema de colas sobre Redis: encolar tareas y procesarlas en segundo plano, con reintentos y tareas repetidas (el tick de cada minuto) | Queues + scheduler de Laravel (Horizon) |
| **Tailwind CSS** | Estilos con clases utilitarias directo en el HTML (`flex`, `p-4`, etc.) | Tailwind, igual |
| **Vitest** | Corre los tests (`npm test`) | PHPUnit / Pest |

## Procesos que corren en desarrollo (`npm run dev`)

| Proceso | Que hace | Puerto |
|---------|----------|--------|
| API (`apps/api`, `main.ts`) | Atiende los pedidos HTTP | 3001 |
| Worker (`apps/api`, `worker.ts`) | Saca tareas de Redis y las ejecuta (por ahora, enviar mails; despues, publicar) | ninguno |
| Web (`apps/web`) | Sirve las pantallas | 3000 |

API y worker comparten el codigo pero son procesos separados (DEC-010): si uno se reinicia, el otro sigue.

## Paquetes de la API (`apps/api`)

### Dependencias (van al programa final)

| Paquete | Para que lo usamos |
|---------|--------------------|
| `@nestjs/common` | Piezas basicas de Nest: decoradores (`@Controller`, `@Injectable`), excepciones HTTP, pipes |
| `@nestjs/core` | El nucleo de Nest: arma la aplicacion y el contenedor de inyeccion de dependencias |
| `@nestjs/platform-express` | Hace que Nest use Express como servidor HTTP por debajo |
| `@nestjs/bullmq` | Conecta Nest con BullMQ: decoradores `@Processor`, `@InjectQueue` |
| `bullmq` | La cola de tareas en si (ver arriba) |
| `ioredis` | El cliente que habla con Redis. BullMQ 6 no lo trae incluido y lo necesita |
| `@prisma/client` | El cliente de Prisma para consultar la DB desde el codigo |
| `@prisma/adapter-pg` | Adaptador que le dice a Prisma 7 que use el driver `pg` para PostgreSQL |
| `pg` | El driver de bajo nivel que habla con PostgreSQL |
| `zod` | Valida datos con un "esquema". Lo usamos para validar las variables del `.env` al arrancar: si falta una, la app no arranca |
| `class-validator` | Validacion de datos de entrada con decoradores (`@IsEmail`, etc.). Lo usan los DTOs de los endpoints | 
| `class-transformer` | Convierte lo que llega (JSON) en instancias de clases/tipos. Trabaja junto a `class-validator` en el `ValidationPipe` |
| `nodemailer` | Envia mails por SMTP (avisos y reporte de errores) |
| `sharp` | Procesa imagenes: corrige la rotacion, recorta o rellena a la proporcion elegida (1:1, 4:5, 1.91:1) y genera el JPEG. Trae su parte nativa ya compilada (no se compila al instalar) |
| `@aws-sdk/client-s3` | Sube y baja imagenes de Cloudflare R2, que habla el mismo protocolo que S3 de Amazon |
| `bcryptjs` | Compara la contrasena que se escribe en el login contra el hash guardado en `ADMIN_PASSWORD_HASH`. Es la version en JavaScript puro de bcrypt (no necesita compilar nada) |
| `@nestjs/jwt` | Crea y verifica el token de sesion (JWT) que viaja en la cookie |
| `cookie-parser` | Hace que Express lea las cookies del pedido (`req.cookies`) para encontrar la sesion |
| `reflect-metadata` | Permite que los decoradores guarden informacion que Nest usa para la inyeccion de dependencias |
| `rxjs` | Libreria de flujos de datos asincronos. Nest la usa internamente; casi no la tocamos |

### Dependencias de desarrollo (solo para programar, no van a produccion)

| Paquete | Para que lo usamos |
|---------|--------------------|
| `typescript` | El compilador/chequeador de tipos |
| `@nestjs/cli` | El comando `nest` (compilar, levantar con recarga automatica) |
| `@nestjs/schematics` | Plantillas para generar archivos con el CLI de Nest |
| `@nestjs/testing` | Utilidades para armar modulos de Nest dentro de los tests |
| `@nestjs/mau` | Viene con el generador de Nest 12 (es parte de su ecosistema). Todavia no lo usamos |
| `prisma` | La herramienta de linea de comandos de Prisma: generar el cliente, crear migraciones |
| `vitest` | El corredor de tests |
| `@vitest/coverage-v8` | Mide cobertura de tests. Viene con el generador; no perseguimos metas de cobertura |
| `vite` | Motor de compilacion que Vitest usa por debajo |
| `@types/multer` | Tipos de TypeScript para los archivos que llegan en un upload (multer ya viene dentro de Nest) |
| `supertest` | Hace pedidos HTTP falsos a la API dentro de los tests |
| `oxlint` | Linter: detecta errores y malas practicas en el codigo (reemplaza a ESLint en la API) |
| `oxlint-tsgolint` | Le suma a oxlint las reglas que necesitan conocer los tipos de TypeScript |
| `prettier` | Formatea el codigo de forma uniforme (`npx prettier --check`) |
| `source-map-support` | Hace que los errores muestren la linea del `.ts` original y no la del `.js` compilado |
| `@types/express`, `@types/node`, `@types/nodemailer`, `@types/pg`, `@types/supertest`, `@types/cookie-parser` | Descripciones de tipos de esas librerias para que TypeScript las entienda. No tienen codigo propio |

## Paquetes de la web (`apps/web`)

| Paquete | Para que lo usamos |
|---------|--------------------|
| `next` | El framework Next.js |
| `react`, `react-dom` | React y su conector para el navegador |
| `tailwindcss` | Tailwind CSS (estilos) |
| `@tailwindcss/turbopack` | Hace que Tailwind funcione con el compilador de Next (Turbopack) |
| `typescript` | Chequeo de tipos (version propia de la web) |
| `eslint`, `eslint-config-next` | Linter de la web con las reglas recomendadas de Next |
| `@types/node`, `@types/react`, `@types/react-dom` | Tipos para TypeScript |

## Que viene despues (todavia NO instalado)

| Paquete | Etapa | Para que |
|---------|-------|----------|
| `shadcn/ui`, `react-hook-form`, `date-fns-tz` | 7 a 9 | Componentes de pantalla, formularios y manejo de zonas horarias |

## Archivos de configuracion que vas a ver

| Archivo | Que hace |
|---------|----------|
| `package.json` | Lista de paquetes y comandos (`npm run ...`) de cada proyecto |
| `package-lock.json` | Versiones exactas instaladas. No se edita a mano |
| `tsconfig.json` | Reglas de TypeScript (modo estricto, etc.) |
| `.env` / `.env.test` | Secretos y configuracion local. Nunca se suben a git. El modelo es `.env.example` |
| `prisma/schema.prisma` | Definicion de las tablas de la DB |
| `prisma.config.ts` | Le dice a Prisma donde esta el schema y la URL de la DB |
| `nest-cli.json` | Configuracion del CLI de Nest |
| `vitest.config.ts` | Configuracion de los tests |
| `.oxlintrc.json`, `.prettierrc` | Reglas del linter y del formateador |
