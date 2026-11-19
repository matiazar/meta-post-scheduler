// Crea el .env para Docker a partir de .env.example: genera las claves y pide mail y contrasena.
// Uso: docker compose run --rm init      (o, con Node: node scripts/init-env.mjs [carpeta])
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import readline from 'node:readline';
import { hash } from 'bcryptjs';
import { applyValues } from './env-template.mjs';

const dir = resolve(process.argv[2] ?? process.cwd());
const example = resolve(dir, '.env.example');
const target = resolve(dir, '.env');

if (!existsSync(example)) {
  console.error(`No se encuentra ${example}`);
  process.exit(1);
}
if (existsSync(target)) {
  console.error('Ya existe un .env: no se pisa. Borralo si queres empezar de nuevo.');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
// Oculta lo que se escribe mientras rl.muted sea true (la contrasena)
rl._writeToOutput = (text) => {
  if (!rl.muted) rl.output.write(text);
};
// Lee linea por linea con un iterador: sirve con teclado y tambien con entrada por pipe
const lines = rl[Symbol.asyncIterator]();
const ask = async (question, muted = false) => {
  process.stdout.write(question);
  rl.muted = muted;
  const { value, done } = await lines.next();
  rl.muted = false;
  if (muted || !process.stdin.isTTY) process.stdout.write('\n');
  if (done) {
    console.error('Entrada terminada antes de completar los datos');
    process.exit(1);
  }
  return String(value).trim();
};

let email = '';
while (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  email = await ask('Mail con el que vas a entrar al panel: ');
}
let password = '';
while (password.length < 12 || password.length > 72) {
  password = await ask('Contrasena (entre 12 y 72 caracteres): ', true);
}
rl.close();

const values = {
  POSTGRES_PASSWORD: randomBytes(24).toString('hex'),
  ADMIN_EMAIL: email,
  ADMIN_PASSWORD_HASH: `'${await hash(password, 12)}'`,
  JWT_SECRET: randomBytes(48).toString('base64url'),
  TOKEN_ENC_KEY: randomBytes(32).toString('base64'),
};

let text;
try {
  text = applyValues(readFileSync(example, 'utf8'), values);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
// Solo el dueño lee el .env (tiene claves). 'wx': falla si el archivo aparecio mientras tanto.
// Como root (dentro del contenedor) no se restringe: en Linux el archivo quedaria de root
// y la persona no podria leerlo desde su usuario.
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
writeFileSync(target, text, { flag: 'wx', ...(isRoot ? {} : { mode: 0o600 }) });

console.log('\n.env creado con las claves generadas.');
console.log('Falta completar a mano lo que dice CAMBIAR: SMTP, Meta y R2 (ver el tutorial del README).');
