import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mytoolhub/shared';

let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

/**
 * 全应用复用同一个 Socket.IO 连接。
 * 开发环境由 Vite 代理 /socket.io 到 3000 端口，生产环境同源。
 */
export function getLogSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!socket) {
    socket = io({
      path: '/socket.io',
      autoConnect: false,
      reconnection: true,
      reconnectionDelay: 800,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    }) as Socket<ServerToClientEvents, ClientToServerEvents>;
  }
  return socket;
}
