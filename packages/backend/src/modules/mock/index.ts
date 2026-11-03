import type { BackendModule } from '../../plugins/register-modules.js';
import { MockListenerManager } from './mock-listener.manager.js';
import { registerMockRoutes } from './mock.routes.js';
import { MockService } from './mock.service.js';
import { RequestLogStore } from './request-log.store.js';

/**
 * Mock 服务器模块。
 * 模块只负责组装自己的依赖，主壳不感知 Mock 的任何业务细节。
 */
export const mockModule: BackendModule = {
  name: 'mock',
  async register(app, { logGateway }) {
    const logs = new RequestLogStore(500);
    const listeners = new MockListenerManager((log) => {
      logs.add(log);
      logGateway.pushLog(log);
    });
    const service = new MockService(listeners, logs);

    // 使用独立作用域注册，后续模块可以继续使用不同的路由前缀
    app.register(
      async (scope) => {
        await registerMockRoutes(scope, service);
      },
      { prefix: '/api/mock' },
    );

    app.addHook('onClose', async () => {
      await service.shutdown();
    });
  },
};
