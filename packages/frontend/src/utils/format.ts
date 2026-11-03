import type { MockHttpMethod, RequestLog } from '@mytoolhub/shared';

const dateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const clockFormatter = new Intl.DateTimeFormat('zh-CN', {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const fullFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

function toDate(value: string): Date | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDateTime(value: string): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date).replace(/\//g, '-') : value;
}

export function formatClock(value: string): string {
  const date = toDate(value);
  return date ? clockFormatter.format(date) : value;
}

export function formatFullTime(value: string): string {
  const date = toDate(value);
  return date ? fullFormatter.format(date).replace(/\//g, '-') : value;
}

export type TagType = 'primary' | 'success' | 'info' | 'warning' | 'danger';

export function methodTagType(method: string): TagType {
  const map: Record<string, TagType> = {
    GET: 'success',
    POST: 'primary',
    PUT: 'warning',
    PATCH: 'warning',
    DELETE: 'danger',
    HEAD: 'info',
    OPTIONS: 'info',
  };
  return map[method.toUpperCase()] ?? 'info';
}

export function httpStatusTagType(statusCode: number): TagType {
  if (statusCode >= 200 && statusCode < 300) return 'success';
  if (statusCode >= 300 && statusCode < 400) return 'warning';
  if (statusCode >= 400) return 'danger';
  return 'info';
}

export function isJsonText(text: string): boolean {
  const value = text.trim();
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

export function prettyJson(text: string): string | null {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return null;
  }
}

/** 生成可以直接在浏览器/上位机中访问的 Mock 地址 */
export function buildMockUrl(ipAddress: string, port: number, path: string): string {
  const ip = ipAddress.trim();
  const host = !ip || ip === '0.0.0.0' || ip === '::' ? 'localhost' : ip;
  const suffix = path.startsWith('/') ? path : '/' + path;
  return 'http://' + host + ':' + port + suffix;
}

export function shortUserAgent(userAgent: string): string {
  if (!userAgent) return '未知客户端';
  if (userAgent.length <= 48) return userAgent;
  return userAgent.slice(0, 48) + '…';
}

export function logToJson(log: RequestLog): string {
  return JSON.stringify(log, null, 2);
}

export function defaultResponseData(): string {
  return '{\n  "code": 0,\n  "message": "ok",\n  "data": {\n    "id": 1,\n    "name": "MyToolHub"\n  }\n}';
}

export function methodList(): MockHttpMethod[] {
  return ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
}
