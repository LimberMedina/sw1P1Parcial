import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Habilita CORS para desarrollo y producción
  const corsOrigins = process.env.NODE_ENV === 'production' 
    ? [
        process.env.CORS_ORIGIN || 'https://uml-editor-frontend-l6hz.onrender.com',
        'https://uml-editor-frontend-l6hz.onrender.com'
      ]
    : ['http://localhost:5173', 'http://127.0.0.1:5173'];
    
  console.log('🌐 CORS Origins configurados:', corsOrigins);
    
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
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
