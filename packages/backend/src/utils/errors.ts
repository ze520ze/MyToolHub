/** 业务异常：路由层统一转换为 { code, message, details? } */
export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: string;

  constructor(statusCode: number, code: string, message: string, details?: string) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
