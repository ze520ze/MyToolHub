import type { FastifyInstance } from 'fastify';
import type {
  CreateMockGroupInput,
  CreateMockInterfaceInput,
  ToggleMockMasterInput,
  UpdateMockGroupInput,
  UpdateMockInterfaceInput,
} from '@mytoolhub/shared';
import type { MockService } from './mock.service.js';

interface IdParams {
  id: string;
}

/**
 * Mock 模块的 HTTP 路由。
 * 这里只做参数转发，业务校验与持久化都在 MockService 中。
 */
export async function registerMockRoutes(
  app: FastifyInstance,
  service: MockService,
): Promise<void> {
  app.get('/groups', async () => service.getGroups());

  app.post<{ Body: CreateMockGroupInput }>('/groups', async (request, reply) => {
    const result = await service.createGroup(request.body);
    return reply.code(201).send(result);
  });

  app.put<{ Params: IdParams; Body: UpdateMockGroupInput }>(
    '/groups/:id',
    async (request) => service.updateGroup(request.params.id, request.body),
  );

  app.delete<{ Params: IdParams }>('/groups/:id', async (request) =>
    service.deleteGroup(request.params.id),
  );

  app.post<{ Body: CreateMockInterfaceInput }>(
    '/interfaces',
    async (request, reply) => {
      const result = await service.createInterface(request.body);
      return reply.code(201).send(result);
    },
  );

  app.put<{ Params: IdParams; Body: UpdateMockInterfaceInput }>(
    '/interfaces/:id',
    async (request) => service.updateInterface(request.params.id, request.body),
  );

  app.delete<{ Params: IdParams }>('/interfaces/:id', async (request) =>
    service.deleteInterface(request.params.id),
  );

  app.post<{ Params: IdParams }>('/interfaces/:id/enable', async (request) =>
    service.enableInterface(request.params.id),
  );

  app.post<{ Params: IdParams }>('/interfaces/:id/disable', async (request) =>
    service.disableInterface(request.params.id),
  );

  app.post<{ Body: ToggleMockMasterInput }>('/master/toggle', async (request) =>
    service.toggleMaster(request.body),
  );

  // 说明书要求的“立即重启”入口
  app.post('/restart', async () => service.restart());

  app.get('/status', async () => service.getStatus());

  app.get('/logs', async () => ({ logs: service.getLogs() }));
}
