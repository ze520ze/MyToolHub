import 'reflect-metadata';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifySocketIO from 'fastify-socket.io';
import type { ApiErrorPayload } from '@mytoolhub/shared';
import { AppDataSource } from './db/data-source.js';
import { LogGateway } from './gateways/log.gateway.js';
import { registerModules } from './plugins/register-modules.js';
import { AppError } from './utils/errors.js';

export interface BuildAppOptions {
  logger?: boolean;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
// 打包为桌面程序时由启动器指定前端目录；开发/源码运行仍使用默认相对路径
const frontendDist = process.env.TOOLHUB_FRONTEND_DIST
  ? path.resolve(process.env.TOOLHUB_FRONTEND_DIST)
  : path.resolve(currentDir, '../../frontend/dist');
const hasFrontendBuild = existsSync(path.join(frontendDist, 'index.html'));

/**
 * 组装 Fastify 应用。
 * 注意：AppDataSource 必须先初始化，MockService 才能拿到 Repository。
 */
export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: options.logger ?? true,
    bodyLimit: 2 * 1024 * 1024,
  });

  // fastify-socket.io 在注册时创建 io，并自动处理关闭
  app.register(fastifySocketIO, {
    serveClient: false,
    cors: { origin: '*' },
  });
  const logGateway = new LogGateway();

  app.setErrorHandler((error, request, reply) => {
    if (reply.sent) return;

    if (error instanceof AppError) {
      const payload: ApiErrorPayload = {
        code: error.code,
        message: error.message,
      };
      if (error.details) payload.details = error.details;
      return reply.code(error.statusCode).send(payload);
    }

    const statusCode =
      typeof error.statusCode === 'number' && error.statusCode >= 400
        ? error.statusCode
        : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, '请求处理失败');
    }

    let message = error.message;
    if (error.code === 'FST_ERR_CTP_INVALID_JSON_BODY') {
      message = '请求体不是合法的 JSON';
    } else if (error.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      message = '请求体过大';
    } else if (statusCode >= 500) {
      message = '服务器内部错误，请查看后端日志';
    }

    const payload: ApiErrorPayload = {
      code:
        statusCode >= 500
          ? 'INTERNAL_ERROR'
          : statusCode === 404
            ? 'NOT_FOUND'
            : 'BAD_REQUEST',
      message,
    };
    if (statusCode >= 500 && process.env.NODE_ENV !== 'production') {
      payload.details = error.stack;
    }
    return reply.code(statusCode).send(payload);
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    name: 'MyToolHub',
    time: new Date().toISOString(),
    modules: ['mock'],
    // 桌面启动器用它确认响应来自自己刚启动的进程
    instanceId: process.env.TOOLHUB_INSTANCE_ID,
  }));

  await AppDataSource.initialize();

  app.addHook('onClose', async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  await registerModules(app, { logGateway });

  if (hasFrontendBuild) {
    // 生产模式：后端直接托管 Vite 构建产物
    app.register(fastifyStatic, {
      root: frontendDist,
      prefix: '/',
      index: ['index.html'],
    });
  } else {
    app.get('/', async () => ({
      name: 'MyToolHub API',
      message: '前端尚未构建，开发模式请访问 http://localhost:5173',
      health: '/api/health',
      mock: '/api/mock/groups',
    }));
  }

  app.setNotFoundHandler((request, reply) => {
    const url = request.url;
    if (url.startsWith('/api') || url.startsWith('/socket.io')) {
      return reply.code(404).send({
        code: 'NOT_FOUND',
        message: `接口不存在：${request.method} ${url.split('?')[0]}`,
      } satisfies ApiErrorPayload);
    }
    if (hasFrontendBuild) {
      // 前端使用 history 路由，未知页面回退到 index.html
      return reply.sendFile('index.html');
    }
    return reply.code(404).send({
      code: 'NOT_FOUND',
      message: '页面不存在',
    } satisfies ApiErrorPayload);
  });

  await app.ready();

  // ready 之后 fastify-socket.io 已完成装饰，再挂接日志网关
  logGateway.attach(app.io);
  app.io.on('connection', (socket) => {
    app.log.info(`Socket.IO 客户端已连接: ${socket.id}`);
  });

  return app;
}
