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
