import { isIPv6 } from 'node:net';

const IPV4_MAPPED = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function expandIPv6(ip: string): string[] {
  const [head, tail] = ip.split('::');
  const headParts = head ? head.split(':') : [];
  const tailParts = tail ? tail.split(':') : [];
  const zeros =
    tail === undefined
      ? []
      : Array(8 - headParts.length - tailParts.length).fill('0');
  return [...headParts, ...zeros, ...tailParts].map((part) =>
    part.padStart(4, '0').toLowerCase(),
  );
}

/**
 * Clave para limitar intentos por cliente. IPv4 tal cual; IPv6 agrupada por /64
 * (cada abonado recibe un /64 entero, asi rotar direcciones dentro de el no da un cupo nuevo).
 */
export function clientKeyFromIp(ip: string | undefined): string {
  if (!ip) return 'unknown';
  const withoutZone = ip.split('%')[0];
  const mapped = IPV4_MAPPED.exec(withoutZone);
  if (mapped) return mapped[1];
  if (!isIPv6(withoutZone)) return withoutZone;
  return `${expandIPv6(withoutZone).slice(0, 4).join(':')}::/64`;
}
