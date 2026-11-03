import type { Server } from 'socket.io';
import { SOCKET_EVENT_NEW_LOG, type RequestLog } from '@mytoolhub/shared';

/**
 * Socket.IO 日志网关。
 * Mock 监听器每收到一个请求就调用 pushLog，前端通过 new-log 事件实时接收。
 */
export class LogGateway {
  private io: Server | null = null;

  attach(io: Server): void {
    this.io = io;
  }

  pushLog(log: RequestLog): void {
    // 服务尚未 ready 或已关闭时静默丢弃，不影响请求本身
    this.io?.emit(SOCKET_EVENT_NEW_LOG, log);
  }

  get clientCount(): number {
    return this.io?.engine.clientsCount ?? 0;
  }
}