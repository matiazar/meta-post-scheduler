import { setDefaultResultOrder } from 'node:dns';

// En algunas redes IPv6 se cuelga y el fetch de Node nunca llega a Meta (timeout),
// aunque curl y el navegador funcionen. Con IPv4 primero se conecta bien.
// Se importa primero en main.ts y worker.ts para que valga antes de cualquier conexion.
setDefaultResultOrder('ipv4first');
