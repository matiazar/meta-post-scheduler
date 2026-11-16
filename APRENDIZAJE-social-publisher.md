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

Para practicar (etapa 2): agregar un campo `website` opcional a `Brand` (schema, migracion con `npm run db:migrate`, DTOs y un caso en `test/brands.e2e-spec.ts`).

## Etapa 3: Conexion Meta

Conceptos nuevos:
- Cliente HTTP propio con `fetch`: `MetaGraphClient` es el unico lugar que habla con Meta; pone timeout (`AbortSignal.timeout`), traduce errores a una excepcion propia y nunca mete tokens en los mensajes.
  Equivalente en Laravel: `Http::` facade o un cliente Guzzle envuelto en una clase de servicio.
  Diferencia clave: `fetch` viene en Node, no hay paquete; y no lanza error en un 4xx/5xx, hay que mirar `response.ok` a mano.
- OAuth con `state` firmado: el `state` lleva nonce + vencimiento + firma HMAC, y el nonce tambien va en una cookie httpOnly. El callback solo vale para el navegador que inicio la conexion (anti-CSRF).
  Equivalente en Laravel: Socialite (`state` en sesion).
  Diferencia clave: Socialite lo guarda en la sesion del servidor; aca no hay sesion, asi que la firma y la cookie hacen ese trabajo.
- Mockear `fetch` y modulos de prueba: los tests reemplazan `MetaGraphClient` por un doble y arman un modulo de Nest chico en el propio test, asi nunca se sale a internet.
  Equivalente en Laravel: `Http::fake()`.
  Diferencia clave: se reemplaza el provider en el modulo de test (inyeccion de dependencias), no una facade global.

Donde verlo en el codigo: apps/api/src/modules/meta/meta-graph.client.ts, apps/api/src/modules/meta/oauth-state.ts, apps/api/test/meta.e2e-spec.ts

Para practicar: agregar un test en `graph-error.spec.ts` para el codigo 368 (bloqueo temporal de Meta) y decidir si es transitorio o permanente.

## Etapa 4: Media

Conceptos nuevos:
- Uploads multipart con `FilesInterceptor`: Nest usa multer por debajo; el interceptor parsea el `multipart/form-data`, aplica limites (10 archivos, 20 MB) y deja los archivos en memoria como `Buffer` en `@UploadedFiles()`.
  Equivalente en Laravel: `$request->file('files')` (UploadedFile) con reglas `max` en un Form Request.
  Diferencia clave: en Laravel el archivo ya esta en disco temporal; aca es un Buffer en RAM y lo tuyo es decidir donde guardarlo (R2). Los limites se rechazan antes de llegar al controller.
- Proveedor por token (`S3_CLIENT`): `StorageModule` crea el cliente de S3 con una `useFactory` y `StorageService` lo recibe con `@Inject(S3_CLIENT)`. Asi los tests le pasan un cliente falso sin tocar el codigo.
  Equivalente en Laravel: `Storage::disk('r2')` o `app()->bind(...)` en un service provider.
  Diferencia clave: en Nest no hay facade global; el servicio declara lo que necesita en el constructor y el modulo decide con que se arma.
- sharp y procesamiento de imagen: `ImageProcessor` es una clase sin red ni disco (Buffer entra, Buffer sale). Valida por contenido, rota segun EXIF, recorta (CROP) o rellena (PAD) y descarta los metadatos.
  Equivalente en Laravel: Intervention Image.
  Diferencia clave: sharp trae su parte nativa precompilada por plataforma (`@img/sharp-win32-x64`); no hay que compilar nada al instalar.

Donde verlo en el codigo: apps/api/src/modules/media/image-processor.ts, apps/api/src/modules/media/media.controller.ts, apps/api/src/modules/storage/storage.module.ts

Para practicar: agregar un formato nuevo aceptado (AVIF) en `SUPPORTED`, con su caso en `image-processor.spec.ts`, y ver que pasa con `sharp` y ese formato.

## Etapa 5: Posts

Conceptos nuevos:
- DTO anidado con `@ValidateNested` + `@Type`: un post trae una lista de destinos (`targets`) y cada uno es un objeto con sus propias reglas. `@Type(() => PostTargetDto)` le dice a class-transformer en que clase convertir cada elemento; sin eso, la validacion interna no corre.
  Equivalente en Laravel: reglas con punto en un Form Request (`targets.*.socialAccountId`).
  Diferencia clave: en Laravel las reglas viven en un array de strings; aca son decoradores sobre clases reales, y hay que declarar la conversion de tipos.
- Transacciones interactivas y UPDATE con guarda: `prisma.$transaction(async (tx) => ...)` agrupa varias escrituras; dentro, `updateMany({ where: { id, status: { in: [...] } } })` solo actua si el estado sigue siendo el esperado, y `count === 0` significa que alguien (el publicador) se adelanto.
  Equivalente en Laravel: `DB::transaction(function () {...})` y `->where('status', ...)->update(...)`.
  Diferencia clave: Prisma no tiene `lockForUpdate` en su API; esa guarda en el WHERE es la forma simple de evitar pisarse entre dos procesos.
- Funcion pura para el estado derivado: `derivePostStatus` recibe los estados de los destinos y devuelve el del post, sin tocar la DB. Eso permite probar todos los casos con 9 tests de una linea cada uno.
  Equivalente en Laravel: un accessor del modelo o un metodo de dominio sin dependencias.
  Diferencia clave: en Nest no hay modelos con logica; lo que en Eloquent seria un metodo del modelo vive en una funcion o un service.

Donde verlo en el codigo: apps/api/src/modules/posts/post-status.ts, apps/api/src/modules/posts/dto/post.dto.ts, apps/api/src/modules/posts/posts.service.ts (metodo update)

Para practicar: agregar la regla "un post de Instagram admite como maximo 30 hashtags" (`CaptionTooLongException` hermana), con su caso en `posts.e2e-spec.ts`.
