import { InvalidEnvException } from '../config/config.exceptions.js';
import { redisConnectionFromUrl } from './redis-connection.js';

describe('redisConnectionFromUrl', () => {
  it('usa defaults para una URL minima', () => {
    expect(redisConnectionFromUrl('redis://localhost')).toMatchObject({
      host: 'localhost',
      port: 6379,
      db: 0,
      username: undefined,
      password: undefined,
      tls: undefined,
    });
  });

  it('lee password sin usuario, puerto y db', () => {
    expect(
      redisConnectionFromUrl('redis://:p%40ss@redis.local:6380/2'),
    ).toMatchObject({
      host: 'redis.local',
      port: 6380,
      db: 2,
      username: undefined,
      password: 'p@ss',
    });
  });

  it('activa TLS con rediss://', () => {
    expect(redisConnectionFromUrl('rediss://host:6379')).toMatchObject({
      tls: {},
    });
  });

  it('falla si el indice de db no es un entero', () => {
    expect(() => redisConnectionFromUrl('redis://localhost/abc')).toThrow(
      InvalidEnvException,
    );
  });
});
