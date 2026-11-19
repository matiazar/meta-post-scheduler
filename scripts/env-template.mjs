// Rellena un .env a partir del texto de .env.example. Separado de init-env.mjs para poder probarlo.

/**
 * Reemplaza el valor de cada clave de `values` en `text`.
 * Falla si alguna clave no esta en la plantilla: un .env con una clave critica en CAMBIAR
 * sin aviso es peor que no crear el archivo.
 */
export function applyValues(text, values) {
  let result = text;
  for (const [key, value] of Object.entries(values)) {
    const line = new RegExp(`^${key}=.*$`, 'm');
    if (!line.test(result)) {
      throw new Error(`La clave ${key} no esta en .env.example`);
    }
    // Funcion de reemplazo: el hash lleva $ y no debe interpretarse como grupo
    result = result.replace(line, () => `${key}=${value}`);
  }
  return result;
}
