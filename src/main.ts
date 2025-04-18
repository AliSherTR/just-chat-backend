import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationFilter } from './common/filters/validation.filter';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: "*"
  })
  app.useGlobalFilters(new ValidationFilter());
  const config = new DocumentBuilder()
    .setTitle('Just Chat')
    .setDescription('API for user authentication and profile management')
    .setVersion('1.0')
    .addTag('')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
