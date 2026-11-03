import type { FastifyInstance } from 'fastify';
import type { LogGateway } from '../gateways/log.gateway.js';
import { mockModule } from '../modules/mock/index.js';

export interface BackendModuleDeps {
  logGateway: LogGateway;
}

/**
 * 后端功能模块契约。
 * 新增功能时只需实现该接口，并把模块加入下方 modules 数组。
 */
export interface BackendModule {
  name: string;
  register: (app: FastifyInstance, deps: BackendModuleDeps) => Promise<void>;
}

const modules: BackendModule[] = [
  mockModule,
  // 未来：serialModule, protocolModule, ...
];

/** 按顺序注册所有功能模块，单个模块失败会阻止服务启动并输出原因 */
export async function registerModules(
  app: FastifyInstance,
  deps: BackendModuleDeps,
): Promise<void> {
  for (const module of modules) {
    await module.register(app, deps);
    app.log.info(`模块已加载: ${module.name}`);
  }
}
