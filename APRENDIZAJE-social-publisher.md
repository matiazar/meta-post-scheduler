# Aprendizaje: social-publisher

Modo aprendizaje activo (Node / NestJS / Next.js, viniendo de Laravel). Al cerrar cada etapa se agrega una entrada acá, con un maximo de 3 conceptos. Las explicaciones largas viven en este archivo, no en el chat.

Formato de cada entrada:

- Conceptos nuevos (que es, equivalente en Laravel, diferencia clave)
- Donde verlo en el codigo (archivo:linea)
- Para practicar (un ejercicio chico sobre este proyecto)

Las entradas se escriben al cerrar la etapa, no antes.

## Etapa 0: Scaffold

Conceptos nuevos:
- Modulos e inyeccion de dependencias: cada carpeta de `src/modules/*` es un `@Module` que declara que provee y que exporta; Nest arma las instancias y las inyecta por constructor.
  Equivalente en Laravel: service container + service providers.
  Diferencia clave: en Laravel todo se resuelve solo por tipo y el container es global. En Nest un provider solo es visible en otro modulo si el primero lo `exports` y el segundo lo `imports` (salvo modulos `@Global()`).
- Exception filter global: `@Catch()` intercepta todo error que escapa de un controller y decide la respuesta HTTP (y si se reporta).
  Equivalente en Laravel: `withExceptions` en `bootstrap/app.php` (`report` / `render`).
  Diferencia clave: se registra como provider con `APP_FILTER`, y las excepciones de negocio extienden `HttpException` para llevar su status.
- Procesos separados API y worker: `main.ts` levanta HTTP; `worker.ts` levanta solo el contexto de DI con los processors de BullMQ.
  Equivalente en Laravel: `php artisan serve` vs `php artisan queue:work`.
  Diferencia clave: en Nest es el mismo codigo con dos entrypoints; que modulos importa cada uno decide que corre en cada proceso (ver `worker.module.ts`).

Donde verlo en el codigo: apps/api/src/app.module.ts, apps/api/src/modules/errors/errors.module.ts, apps/api/src/worker.module.ts

Para practicar: agregar a `HealthResult` un campo `uptimeSeconds` (`process.uptime()`), con su test en `health.service.spec.ts`.

## Etapa 1: Auth

Conceptos nuevos:
- Guard global con `@Public()`: un `CanActivate` registrado como `APP_GUARD` protege todas las rutas; las publicas se marcan con un decorator que guarda metadata y el guard la lee con `Reflector`.
  Equivalente en Laravel: middleware `auth` aplicado a todo el grupo, con rutas excluidas.
  Diferencia clave: aca el default es "protegido" y lo publico se declara; si te olvidas de proteger algo, queda cerrado, no abierto.
- DTO con class-validator: la clase del body lleva decorators (`@IsEmail`, `@IsString`) y el `ValidationPipe` global valida y rechaza campos de mas (`whitelist` + `forbidNonWhitelisted`).
  Equivalente en Laravel: Form Request con `rules()`.
  Diferencia clave: la validacion es por decorators sobre la clase, y los campos no declarados se rechazan, no se ignoran.
- JWT en cookie httpOnly: la sesion es un token firmado (sin estado en el servidor) guardado en una cookie que el JS del navegador no puede leer.
  Equivalente en Laravel: sesion con cookie (`Auth::attempt`).
  Diferencia clave: no hay tabla ni store de sesiones; por eso el logout solo borra la cookie y el token vale hasta que vence (7 dias).

Donde verlo en el codigo: apps/api/src/modules/auth/auth.guard.ts, apps/api/src/modules/auth/dto/login.dto.ts, apps/api/src/modules/auth/auth.controller.ts

Para practicar: bajar `SESSION_TTL_SECONDS` a 1 hora en `auth.constants.ts` y ajustar el test que lo cubre.

## Etapa 2: Modelo y marcas

Conceptos nuevos:
- Prisma schema y migraciones: el modelo vive en `schema.prisma`; `prisma migrate dev` genera el SQL versionado en `prisma/migrations` y `prisma generate` crea el cliente tipado.
  Equivalente en Laravel: migrations + Eloquent models, pero acá el schema es la fuente unica y los tipos salen de ahi.
  Diferencia clave: no hay clases de modelo con logica; el cliente es solo acceso a datos tipado. La logica va en los services.
- Select con lista blanca: `SocialAccountsService` pide a la DB solo los campos publicos (`select`), asi el token cifrado nunca sale de la capa de datos.
  Equivalente en Laravel: `$hidden` en el modelo o un API Resource.
  Diferencia clave: en Laravel ocultas lo sensible y el resto sale; aca declaras lo que SI sale, y un campo nuevo no se expone por accidente.
- Cifrado AES-256-GCM con `node:crypto`: `CryptoService` cifra los tokens de Meta con IV aleatorio y etiqueta de autenticacion; si alguien altera el dato, descifrar falla.
  Equivalente en Laravel: `Crypt::encryptString` (usa APP_KEY).
  Diferencia clave: en Nest lo armamos nosotros con el modulo nativo; la clave es `TOKEN_ENC_KEY` y si se pierde o cambia, los tokens guardados no se pueden leer.

Donde verlo en el codigo: apps/api/prisma/schema.prisma, apps/api/src/modules/brands/social-accounts.service.ts, apps/api/src/modules/crypto/crypto.service.ts

Para practicar: agregar un campo `website` opcional a `Brand` (schema, migracion con `npm run db:migrate`, DTOs y un caso en `test/brands.e2e-spec.ts`).
