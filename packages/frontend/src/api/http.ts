import axios, { AxiosError } from 'axios';
import type { ApiErrorPayload } from '@mytoolhub/shared';

export class ApiError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly details?: string;

  constructor(message: string, code: string, status?: number, details?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

http.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiErrorPayload>) => {
    const payload = error.response?.data;
    let message = payload?.message;

    if (!message) {
      if (error.code === 'ECONNABORTED') {
        message = '请求超时，请确认后端服务是否正常运行';
      } else if (!error.response) {
        message = '无法连接后端服务，请确认服务已启动（默认端口 3000）';
      } else {
        message = '请求失败（HTTP ' + error.response.status + '）';
      }
    }

    return Promise.reject(
      new ApiError(
        message,
        payload?.code ?? 'NETWORK_ERROR',
        error.response?.status,
        payload?.details,
      ),
    );
  },
);

export function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}
