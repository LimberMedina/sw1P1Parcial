// src/common/redis.module.ts
import { Global, Module } from '@nestjs/common';
import Redis, { RedisOptions } from 'ioredis';

function makeRedis(urlEnv?: string) {
  const url = urlEnv ?? 'redis://localhost:6379';
  const client = new Redis(url, {
   
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, 2000), 
  } as RedisOptions);

  client.on('error', (err) => {
    
    console.error('[Redis] error:', err?.message ?? err);
  });
  client.on('connect', () => console.log('[Redis] connected'));
  client.on('ready', () => console.log('[Redis] ready'));
  client.on('reconnecting', () => console.log('[Redis] reconnecting...'));

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
