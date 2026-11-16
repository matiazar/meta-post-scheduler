import { SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './auth.constants.js';

/** Marca una ruta como accesible sin sesion (login, health, callback de OAuth). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
