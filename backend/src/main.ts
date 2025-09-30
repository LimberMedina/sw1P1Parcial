import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita CORS para desarrollo y producción
  const corsOrigins = process.env.NODE_ENV === 'production' 
    ? [process.env.CORS_ORIGIN || 'https://tu-frontend.onrender.com']
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
    
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  console.log(`🚀 Servidor ejecutándose en puerto ${port}`);
}
bootstrap();
