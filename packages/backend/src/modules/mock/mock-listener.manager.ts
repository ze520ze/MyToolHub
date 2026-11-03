import { randomUUID } from 'node:crypto';
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { Socket } from 'node:net';
import type {
  MockGroupWithInterfaces,
  MockInterfaceConfig,
  RequestLog,
} from '@mytoolhub/shared';
import { AppError } from '../../utils/errors.js';

export type MockRequestListener = (log: RequestLog) => void;

interface RuntimeInterface extends MockInterfaceConfig {
  groupName: string;
  /** 已转为小写、去掉末尾斜杠的匹配路径 */
  normalizedPath: string;
}

interface ListenerGroup {
  host: string;
  port: number;
  items: RuntimeInterface[];
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods':
    'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS',
};

/** 统一 URL 匹配规则：忽略大小写、忽略末尾斜杠、忽略 query */
export function normalizeMockPath(input: string): string {
  let path = (input.split('?')[0] ?? '/').trim();
  if (!path) path = '/';
  if (!path.startsWith('/')) path = `/${path}`;
  path = path.toLowerCase();
  while (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  return path;
}

function routeKey(method: string, normalizedPath: string): string {
  return `${method.toUpperCase()} ${normalizedPath}`;
}

function listenerKey(host: string, port: number): string {
  return `${host}|${port}`;
}

function safePathname(rawUrl: string): string {
  try {
    return new URL(rawUrl, 'http://localhost').pathname;
  } catch {
    return rawUrl.split('?')[0] || '/';
  }
}

/** 合法 JSON（允许前后空白）返回压缩后的字符串，否则返回 null */
function tryCompressJson(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  try {
    return JSON.stringify(JSON.parse(text));
  } catch {
    return null;
  }
}

function clientIp(req: IncomingMessage): string {
  const address = req.socket.remoteAddress ?? '';
  return address.startsWith('::ffff:') ? address.slice(7) : address;
}

/**
 * 一个监听器对应一个唯一的 host + port。
 * 同一端口上的多个接口通过 METHOD + PATH 在内部路由，满足“同端口多接口共存”。
 */
class HttpListener {
  readonly routes = new Map<string, RuntimeInterface>();
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private closed = false;

  constructor(
    readonly host: string,
    readonly port: number,
    items: RuntimeInterface[],
    private readonly onLog: MockRequestListener,
  ) {
    for (const item of items) {
      this.routes.set(routeKey(item.httpMethod, item.normalizedPath), item);
    }

    this.server = createServer((req, res) => this.handleRequest(req, res));
    this.server.on('connection', (socket) => {
      this.sockets.add(socket);
      socket.on('close', () => this.sockets.delete(socket));
    });
    // 监听成功后的运行期错误只记录日志，避免进程崩溃
    this.server.on('error', (error) => {
      if (this.server.listening) {
        console.error(`[mock] 监听器错误 ${this.host}:${this.port}`, error);
      }
    });
  }

  get key(): string {
    return listenerKey(this.host, this.port);
  }

  get interfaceCount(): number {
    return this.routes.size;
  }

  hasInterface(interfaceId: string): boolean {
    for (const item of this.routes.values()) {
      if (item.id === interfaceId) return true;
    }
    return false;
  }

  add(item: RuntimeInterface): void {
    const key = routeKey(item.httpMethod, item.normalizedPath);
    const existing = this.routes.get(key);
    if (existing && existing.id !== item.id) {
      throw new AppError(
        409,
        'MOCK_ROUTE_CONFLICT',
        `接口路径冲突：端口 ${this.port} 上的 ${item.httpMethod} ${item.normalizedPath} 已被其他接口使用`,
        `冲突接口：「${existing.groupName} / ${existing.name}」与「${item.groupName} / ${item.name}」`,
      );
    }
    this.routes.set(key, item);
  }

  removeInterface(interfaceId: string): boolean {
    let removed = false;
    for (const [key, item] of this.routes) {
      if (item.id === interfaceId) {
        this.routes.delete(key);
        removed = true;
      }
    }
    return removed;
  }

  async start(): Promise<void> {
    try {
      await new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
          this.server.off('listening', onListening);
          reject(error);
        };
        const onListening = (): void => {
          this.server.off('error', onError);
          resolve();
        };
        this.server.once('error', onError);
        this.server.once('listening', onListening);
        this.server.listen(this.port, this.host);
      });
      this.closed = false;
      console.log(
        `[mock] 监听已启动 http://${this.host}:${this.port}（${this.routes.size} 个接口）`,
      );
    } catch (error) {
      this.closed = true;
      await this.stop();
      throw this.describeListenError(error);
    }
  }

  async stop(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    for (const socket of this.sockets) {
      socket.destroy();
    }
    this.sockets.clear();
    if (!this.server.listening) return;
    await new Promise<void>((resolve) => {
      this.server.close(() => resolve());
    });
  }

  private describeListenError(error: unknown): AppError {
    const err = error as NodeJS.ErrnoException;
    const target = `${this.host}:${this.port}`;
    switch (err.code) {
      case 'EADDRINUSE':
        return new AppError(
          409,
          'MOCK_PORT_IN_USE',
          `端口 ${this.port} 已被占用，请更换端口或关闭占用该端口的程序`,
          `监听地址：${target}`,
        );
      case 'EACCES':
        return new AppError(
          409,
          'MOCK_PORT_FORBIDDEN',
          `没有权限监听端口 ${this.port}，请换一个大于 1024 的端口`,
          `监听地址：${target}`,
        );
      case 'EADDRNOTAVAIL':
        return new AppError(
          400,
          'MOCK_IP_NOT_AVAILABLE',
          `无法绑定 IP 地址 ${this.host}，请确认该地址属于本机`,
          `监听地址：${target}`,
        );
      default:
        return new AppError(
          500,
          'MOCK_LISTEN_FAILED',
          `Mock 服务启动失败（${target}）`,
          err.message || String(error),
        );
    }
  }

  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const startedAt = process.hrtime.bigint();
    // 丢弃请求体，保证 keep-alive 连接可复用
    req.resume();

    const method = (req.method ?? 'GET').toUpperCase();
    const rawUrl = req.url ?? '/';
    const pathname = safePathname(rawUrl);
    const normalizedPath = normalizeMockPath(pathname);
    const item = this.routes.get(routeKey(method, normalizedPath));

    for (const [name, value] of Object.entries(CORS_HEADERS)) {
      res.setHeader(name, value);
    }
    res.setHeader('X-Mock-Server', 'MyToolHub');

    let statusCode = 200;
    let body = '';
    let contentType = 'text/plain; charset=utf-8';

    if (item) {
      const compressed = tryCompressJson(item.responseData ?? '');
      if (compressed !== null) {
        body = compressed;
        contentType = 'application/json; charset=utf-8';
      } else {
        body = item.responseData ?? '';
        contentType = 'text/plain; charset=utf-8';
      }
    } else if (method === 'OPTIONS') {
      // 未配置 OPTIONS 接口时，统一响应 CORS 预检
      statusCode = 204;
      res.setHeader('Allow', this.allowedMethods(normalizedPath));
    } else {
      statusCode = 404;
      contentType = 'application/json; charset=utf-8';
      body = JSON.stringify({
        code: 'MOCK_NOT_FOUND',
        message: '未找到匹配的 Mock 接口',
        method,
        path: pathname,
      });
    }

    res.statusCode = statusCode;
    if (body) {
      res.setHeader('Content-Type', contentType);
    }
    res.setHeader('Content-Length', Buffer.byteLength(body));
    res.end(body);

    const durationMs = Math.max(
      0,
      Math.round(Number(process.hrtime.bigint() - startedAt) / 1_000_000),
    );
    const responsePreview =
      body.length > 2000 ? `${body.slice(0, 2000)}…` : body;

    const log: RequestLog = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      method,
      url: rawUrl,
      interfaceId: item?.id,
      interfaceName: item?.name,
      groupName: item?.groupName,
      statusCode,
      durationMs,
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] ?? ''),
      responsePreview,
    };

    try {
      this.onLog(log);
    } catch (error) {
      console.error('[mock] 写入请求日志失败', error);
    }
  }

  private allowedMethods(normalizedPath: string): string {
    const methods = new Set<string>(['OPTIONS']);
    for (const item of this.routes.values()) {
      if (item.normalizedPath === normalizedPath) {
        methods.add(item.httpMethod);
      }
    }
    if (methods.size === 1) {
      return 'GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS';
    }
    return [...methods].join(', ');
  }
}

/**
 * 动态监听器管理器。
 * - 总开关控制全部监听器；
 * - 启用/停用单个接口时即时增删路由或监听器；
 * - 启动失败自动回滚，总开关保持关闭。
 */
export class MockListenerManager {
  private listeners: HttpListener[] = [];
  private master = false;

  constructor(private readonly onLog: MockRequestListener) {}

  get masterEnabled(): boolean {
    return this.master;
  }

  get status(): {
    masterEnabled: boolean;
    running: boolean;
    runningInterfaces: number;
    ports: number[];
  } {
    const ports = [...new Set(this.listeners.map((item) => item.port))].sort(
      (a, b) => a - b,
    );
    return {
      masterEnabled: this.master,
      running: this.master,
      runningInterfaces: this.listeners.reduce(
        (total, item) => total + item.interfaceCount,
        0,
      ),
      ports,
    };
  }

  async startAll(groups: MockGroupWithInterfaces[]): Promise<void> {
    await this.stopAll();

    const items: RuntimeInterface[] = [];
    for (const group of groups) {
      if (!group.enabled) continue;
      for (const item of group.interfaces) {
        if (!item.enabled) continue;
        items.push({
          ...item,
          groupName: group.name,
          normalizedPath: normalizeMockPath(item.url),
        });
      }
    }

    this.validateRouteConflicts(items);

    const grouped = new Map<string, ListenerGroup>();
    for (const item of items) {
      const host = item.ipAddress.trim() || '0.0.0.0';
      const key = listenerKey(host, item.port);
      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        grouped.set(key, { host, port: item.port, items: [item] });
      }
    }

    try {
      for (const group of grouped.values()) {
        const listener = new HttpListener(
          group.host,
          group.port,
          group.items,
          this.onLog,
        );
        await listener.start();
        this.listeners.push(listener);
      }
      this.master = true;
    } catch (error) {
      await this.stopAll();
      if (error instanceof AppError) throw error;
      throw new AppError(
        500,
        'MOCK_START_FAILED',
        'Mock 服务启动失败',
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  async stopAll(): Promise<void> {
    const current = this.listeners;
    this.listeners = [];
    this.master = false;
    await Promise.all(current.map((listener) => listener.stop()));
  }

  async enableInterface(
    item: MockInterfaceConfig,
    groupName: string,
  ): Promise<void> {
    if (!this.master) {
      throw new AppError(
        409,
        'MOCK_MASTER_OFF',
        'Mock 服务总开关未开启，请先开启总开关',
      );
    }

    const host = item.ipAddress.trim() || '0.0.0.0';
    const runtime: RuntimeInterface = {
      ...item,
      groupName,
      normalizedPath: normalizeMockPath(item.url),
    };
    const current = this.listeners.find(
      (listener) => listener.key === listenerKey(host, item.port),
    );

    if (current) {
      // 配置更新需要重启才生效；已存在的接口不在这里覆盖运行中的旧配置
      if (current.hasInterface(item.id)) return;
      current.add(runtime);
      return;
    }

    const listener = new HttpListener(host, item.port, [runtime], this.onLog);
    await listener.start();
    this.listeners.push(listener);
  }

  async disableInterface(interfaceId: string): Promise<void> {
    for (const listener of [...this.listeners]) {
      const removed = listener.removeInterface(interfaceId);
      if (!removed) continue;
      if (listener.interfaceCount === 0) {
        this.listeners = this.listeners.filter((item) => item !== listener);
        await listener.stop();
      }
      return;
    }
  }

  private validateRouteConflicts(items: RuntimeInterface[]): void {
    const seen = new Map<string, RuntimeInterface>();
    for (const item of items) {
      const host = item.ipAddress.trim() || '0.0.0.0';
      const key = `${listenerKey(host, item.port)}|${routeKey(item.httpMethod, item.normalizedPath)}`;
      const existing = seen.get(key);
      if (existing) {
        throw new AppError(
          409,
          'MOCK_ROUTE_CONFLICT',
          `接口路径冲突：端口 ${item.port} 上的 ${item.httpMethod} ${item.normalizedPath} 被重复配置`,
          `冲突接口：「${existing.groupName} / ${existing.name}」与「${item.groupName} / ${item.name}」`,
        );
      }
      seen.set(key, item);
    }
  }
}
