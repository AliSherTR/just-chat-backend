import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { createResponse } from '../utils/reponse.utils';

@Catch(HttpException)
export class ValidationFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const status = exception.getStatus();

    let message = 'An error occurred';
    let errors: string[] = [];

    if (status === HttpStatus.BAD_REQUEST) {
      const exceptionResponse = exception.getResponse();
      if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        errors = Array.isArray(exceptionResponse.message)
          ? exceptionResponse.message
          : [exceptionResponse.message];
        message = 'Validation failed';
      }
    } else {
      message = exception.message;
    }

    // createResponse(
    //     status === HttpStatus.OK ? 'success' : 'error',
    //     message,
    //     null,
    //     errors,
    // )

    response
      .status(status)
      .json(createResponse('error', message, null, errors));
  }
}
