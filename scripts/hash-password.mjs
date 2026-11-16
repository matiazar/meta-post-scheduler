// Genera el hash bcrypt para ADMIN_PASSWORD_HASH. Uso: npm run hash-password
import readline from 'node:readline';
import { hash } from 'bcryptjs';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: Boolean(process.stdin.isTTY),
});
// Oculta lo que se escribe
rl._writeToOutput = (text) => {
  if (!rl.muted) rl.output.write(text);
};

rl.question(
  'Contrasena del admin (minimo 12 caracteres): ',
  async (password) => {
    rl.close();
    process.stdout.write('\n');
    if (password.length < 12 || password.length > 72) {
      console.error('La contrasena debe tener entre 12 y 72 caracteres');
      process.exit(1);
    }
    const hashed = await hash(password, 12);
    console.log(
      'Copiar esta linea en apps/api/.env (con las comillas simples):\n',
    );
    console.log(`ADMIN_PASSWORD_HASH='${hashed}'`);
  },
);
rl.muted = true;
