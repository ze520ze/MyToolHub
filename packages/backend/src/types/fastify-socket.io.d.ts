import type { FastifyPluginAsync } from 'fastify';
import type { ServerOptions } from 'socket.io';

declare module 'fastify-socket.io' {
  /** fastify-socket.io 没有自带类型声明，这里补上项目用到的最小签名 */
  const fastifySocketIO: FastifyPluginAsync<ServerOptions>;
  export default fastifySocketIO;
}
