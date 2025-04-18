import { ApiResponse } from '../interfaces/response.interface';

export function createResponse<T>(
  status: 'success' | 'error',
  message: string,
  data: T | null = null,
  errors: string[] | null = null,
): ApiResponse<T> {
  return { status, message, data, errors };
}
