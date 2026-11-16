// Levanta API, worker y web con un solo comando: npm run dev
import { spawn } from 'node:child_process';

const procs = [
  ['api', ['run', 'start:dev', '-w', 'apps/api']],
  ['worker', ['run', 'start:worker:dev', '-w', 'apps/api']],
  ['web', ['run', 'dev', '-w', 'apps/web']],
];

const children = procs.map(([name, args]) => {
  const child = spawn('npm', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });
  const prefix = `[${name}] `;
  for (const stream of [child.stdout, child.stderr]) {
    stream.on('data', (chunk) =>
      process.stdout.write(
        String(chunk)
          .split('\n')
          .filter(Boolean)
          .map((line) => prefix + line)
          .join('\n') + '\n',
      ),
    );
  }
  child.on('exit', (code) => {
    console.log(`${prefix}termino con codigo ${code}`);
  });
  return child;
});

function stop() {
  for (const child of children) {
    if (process.platform === 'win32' && child.pid) {
      // En Windows kill() solo mata el shell; /T mata todo el arbol de procesos
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
      });
    } else {
      child.kill();
    }
  }
  setTimeout(() => process.exit(0), 500);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
