# Constraints: social-publisher

## Chequeos

| Chequeo | Comando | Cuando |
|---------|---------|--------|
| Formato | `npx prettier --check <archivos>` | Cada cambio, solo archivos tocados |
| Lint api | `npm run lint -w apps/api` (oxlint) | Cada cambio en la API |
| Lint web | `npm run lint -w apps/web` (eslint) | Cada cambio en la web |
| Typecheck | `npm run typecheck -w apps/api` / `-w apps/web` | Cada cambio en ese workspace |
| Test del modulo | `npm test -w apps/api -- src/modules/<modulo>` | Cada cambio |
| Suite completa | `npm test -w apps/api && npm run test:e2e -w apps/api` | Cierre de etapa en init, antes de deploy |
| Build | `npm run build` | Antes de deploy, o si se toca config de build |

## Umbrales

- Formato, lint y typecheck: 0 errores en los archivos tocados
- TypeScript `strict: true` en ambos workspaces
- Tests del modulo tocado en verde. Tests de DB contra `social_publisher_test` (`.env.test`), nunca la de desarrollo
- Llamadas a Meta y R2 mockeadas en tests: nunca se publica de verdad desde un test
- Sin dependencias nuevas fuera de las del spec sin OK de Matias

## Prohibido para llegar a verde

Ninguno de estos se agrega sin OK explicito de Matias, y si se aprueba lleva un comentario con el motivo:

- Silenciar el linter o el tipado: `eslint-disable`, `oxlint-disable`, `// @ts-ignore`, `// @ts-expect-error` sin motivo
- Saltear o recortar tests: `.skip`, `.only`, `xit`
- Borrar o debilitar un assert para que pase
- Bajar umbrales o reglas del linter, o excluir archivos del lint o los tests
- `git commit --no-verify` o saltear hooks
- `catch` vacio o que solo loguea para que el test no explote
- Mockear la unidad que se esta testeando
