import type { Server } from 'socket.io';

declare module 'fastify' {
  interface FastifyInstance {
    /** fastify-socket.io 注入的 Socket.IO 服务端实例 */
    io: Server;
  }
}

export {};
