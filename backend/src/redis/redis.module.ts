// src/common/redis.module.ts
import { Global, Module } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

function makeRedis(urlEnv?: string) {
  const url = urlEnv ?? 'redis://localhost:6379';
  console.log(`[Redis] Conectando a: ${url.replace(/\/\/.*@/, '//***:***@')}`); // Log sin credenciales
  
  const client = new Redis(url, {
    // Evita MaxRetriesPerRequestError al iniciar si Redis demora
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => {
      const delay = Math.min(times * 200, 2000);
      console.log(`[Redis] Reintentando conexión en ${delay}ms (intento ${times})`);
      return delay;
    },
    lazyConnect: true, // No conectar automáticamente
  } as RedisOptions);

  client.on('error', (err) => {
    // Log útil para diagnosticar (host/puerto incorrectos, firewall, etc.)
    console.error('[Redis] error:', err?.message ?? err);
  });
  client.on('connect', () => console.log('[Redis] connected'));
  client.on('ready', () => console.log('[Redis] ready'));
  client.on('reconnecting', () => console.log('[Redis] reconnecting...'));
  client.on('close', () => console.log('[Redis] connection closed'));

  // Conectar explícitamente
  client.connect().catch(err => {
    console.error('[Redis] Error al conectar:', err?.message ?? err);
  });

  return client;
}

@Global()
@Module({
  providers: [
    {
      provide: 'REDIS_PUB',
      useFactory: () => makeRedis(process.env.REDIS_URL),
    },
    {
      provide: 'REDIS_SUB',
      useFactory: () => makeRedis(process.env.REDIS_URL),
    },
  ],
  exports: ['REDIS_PUB', 'REDIS_SUB'],
})
export class RedisModule {}
