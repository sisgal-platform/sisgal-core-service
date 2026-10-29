import { HttpException } from '@nestjs/common';

export interface DescribedException {
  httpStatus: number;
  message: string;
  /** Solo en errores internos; en los de negocio (4xx) no aporta nada. */
  stackTrace: string | null;
}

/**
 * El cuerpo de una HttpException puede ser un texto o un objeto con `message`
 * (que a su vez es un arreglo cuando falla la validación de varios campos).
 */
function extractMessage(response: string | object, fallback: string): string {
  if (typeof response === 'string') {
    return response;
  }

  const message = (response as { message?: unknown }).message;
  if (Array.isArray(message)) {
    return message.map(String).join('; ');
  }
  return typeof message === 'string' ? message : fallback;
}

/** Resume cualquier excepción en lo que necesita el registro de auditoría. */
export function describeException(exception: unknown): DescribedException {
  if (exception instanceof HttpException) {
    const httpStatus = exception.getStatus();
    return {
      httpStatus,
      message: extractMessage(exception.getResponse(), exception.message),
      stackTrace: httpStatus >= 500 ? (exception.stack ?? null) : null,
    };
  }

  // Una excepción que no es HttpException termina en un 500 para el cliente.
  const error = exception instanceof Error ? exception : null;
  return {
    httpStatus: 500,
    message: error?.message ?? 'Error desconocido.',
    stackTrace: error?.stack ?? null,
  };
}
