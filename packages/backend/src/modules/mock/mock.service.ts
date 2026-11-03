import {
  MOCK_HTTP_METHODS,
  MOCK_INTERFACE_TYPES,
  type CreateMockGroupInput,
  type CreateMockInterfaceInput,
  type MockDeleteResult,
  type MockGroupMutationResult,
  type MockGroupWithInterfaces,
  type MockHttpMethod,
  type MockInterfaceConfig,
  type MockInterfaceMutationResult,
  type MockInterfaceType,
  type MockMasterResult,
  type MockRuntimeStatus,
  type MockToggleInterfaceResult,
  type RequestLog,
  type ToggleMockMasterInput,
  type UpdateMockGroupInput,
  type UpdateMockInterfaceInput,
} from '@mytoolhub/shared';
import { AppDataSource } from '../../db/data-source.js';
import { AppError } from '../../utils/errors.js';
import { MockGroup } from './entities/mock-group.entity.js';
import { MockInterface } from './entities/mock-interface.entity.js';
import { MockListenerManager } from './mock-listener.manager.js';
import { RequestLogStore } from './request-log.store.js';

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function validationError(message: string): AppError {
  return new AppError(400, 'VALIDATION_ERROR', message);
}

function normalizeGroupName(value: unknown): string {
  if (typeof value !== 'string') throw validationError('分组名称必须是字符串');
  const name = value.trim();
  if (!name) throw validationError('分组名称不能为空');
  if (name.length > 50) throw validationError('分组名称不能超过 50 个字符');
  return name;
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw validationError('开关状态必须是布尔值');
  return value;
}

function normalizeInterfaceName(value: unknown): string {
  if (typeof value !== 'string') throw validationError('接口名称必须是字符串');
  const name = value.trim();
  if (!name) throw validationError('接口名称不能为空');
  if (name.length > 50) throw validationError('接口名称不能超过 50 个字符');
  return name;
}

function normalizeInterfaceType(value: unknown): MockInterfaceType {
  if (typeof value !== 'string' || !MOCK_INTERFACE_TYPES.includes(value as MockInterfaceType)) {
    throw validationError('协议类型只能是 WebApi、WebService 或 Socket');
  }
  return value as MockInterfaceType;
}

function normalizeIpAddress(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw validationError('IP 地址必须是字符串');
  const ip = value.trim();
  if (ip.length > 100) throw validationError('IP 地址过长');
  return ip;
}

function normalizePort(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw validationError('端口必须是整数');
  }
  if (value < 1 || value > 65535) {
    throw validationError('端口范围必须是 1-65535');
  }
  return value;
}

function normalizeUrl(value: unknown): string {
  if (typeof value !== 'string') throw validationError('接口路径必须是字符串');
  const url = value.trim();
  if (!url) throw validationError('接口路径不能为空');
  if (!url.startsWith('/')) throw validationError('接口路径必须以 / 开头');
  if (/\s/.test(url)) throw validationError('接口路径不能包含空格');
  if (url.length > 500) throw validationError('接口路径不能超过 500 个字符');
  return url;
}

function normalizeHttpMethod(value: unknown): MockHttpMethod {
  if (typeof value !== 'string') throw validationError('HTTP 方法必须是字符串');
  const method = value.toUpperCase();
  if (!MOCK_HTTP_METHODS.includes(method as MockHttpMethod)) {
    throw validationError('不支持的 HTTP 方法');
  }
  return method as MockHttpMethod;
}

function normalizeResponseData(value: unknown): string {
  if (value === undefined) return '';
  if (typeof value !== 'string') throw validationError('响应数据必须是文本');
  return value;
}

export class MockService {
  private readonly groupRepo = AppDataSource.getRepository(MockGroup);
  private readonly interfaceRepo = AppDataSource.getRepository(MockInterface);

  constructor(
    private readonly listeners: MockListenerManager,
    private readonly logs: RequestLogStore,
  ) {}

  async getGroups(): Promise<MockGroupWithInterfaces[]> {
    const groups = await this.groupRepo.find({
      relations: { interfaces: true },
      order: { createdAt: 'ASC' },
    });
    return groups.map((group) => this.toGroupDto(group));
  }

  async createGroup(input: CreateMockGroupInput): Promise<MockGroupMutationResult> {
    const name = normalizeGroupName(input?.name);
    const enabled = normalizeBoolean(input?.enabled, true);
    await this.assertGroupNameUnique(name);

    const entity = this.groupRepo.create({ name, enabled });
    const saved = await this.groupRepo.save(entity);
    saved.interfaces = [];
    return {
      message: '分组创建成功',
      needsRestart: false,
      group: this.toGroupDto(saved),
    };
  }

  async updateGroup(
    id: string,
    input: UpdateMockGroupInput,
  ): Promise<MockGroupMutationResult> {
    const group = await this.findGroup(id);
    const previousName = group.name;
    const previousEnabled = group.enabled;

    if (input?.name !== undefined) {
      const name = normalizeGroupName(input.name);
      await this.assertGroupNameUnique(name, id);
      group.name = name;
    }
    if (input?.enabled !== undefined) {
      group.enabled = normalizeBoolean(input.enabled, group.enabled);
    }

    const changed = group.name !== previousName || group.enabled !== previousEnabled;
    if (changed) {
      await this.groupRepo.save(group);
    }

    const hasEnabledInterfaces = (group.interfaces ?? []).some((item) => item.enabled);
    const needsRestart =
      changed && hasEnabledInterfaces && this.listeners.masterEnabled;

    return {
      message:
        changed && needsRestart
          ? '分组已保存，需重启 Mock 服务后生效'
          : changed
            ? '分组已保存'
            : '分组配置未发生变化',
      needsRestart,
      group: this.toGroupDto(group),
    };
  }

  async deleteGroup(id: string): Promise<MockDeleteResult> {
    const group = await this.findGroup(id);
    const interfaces = group.interfaces ?? [];

    await AppDataSource.transaction(async (manager) => {
      await manager.delete(MockInterface, { groupId: id });
      await manager.delete(MockGroup, { id });
    });

    // 数据库删除成功后再释放监听端口，避免删除失败但服务已被中断
    for (const item of interfaces) {
      await this.listeners.disableInterface(item.id);
    }

    return { message: '分组已删除', needsRestart: false };
  }

  async createInterface(
    input: CreateMockInterfaceInput,
  ): Promise<MockInterfaceMutationResult> {
    if (!input?.groupId) throw validationError('必须指定所属分组');
    const group = await this.findGroup(input.groupId);
    const name = normalizeInterfaceName(input.name);
    await this.assertInterfaceNameUnique(group.id, name);

    const entity = this.interfaceRepo.create({
      groupId: group.id,
      name,
      type: normalizeInterfaceType(input.type),
      ipAddress: normalizeIpAddress(input.ipAddress),
      port: normalizePort(input.port ?? 8080),
      url: normalizeUrl(input.url ?? '/api/test'),
      httpMethod: normalizeHttpMethod(input.httpMethod ?? 'GET'),
      responseData: normalizeResponseData(input.responseData),
      // 新接口默认停用，由用户确认后再启动监听
      enabled: false,
    });
    const saved = await this.interfaceRepo.save(entity);

    return {
      message: '接口创建成功，默认为停用状态',
      needsRestart: false,
      interface: this.toInterfaceDto(saved),
    };
  }

  async updateInterface(
    id: string,
    input: UpdateMockInterfaceInput,
  ): Promise<MockInterfaceMutationResult> {
    const entity = await this.findInterface(id);
    const group = entity.group;
    let changed = false;

    if (input?.name !== undefined) {
      const name = normalizeInterfaceName(input.name);
      await this.assertInterfaceNameUnique(entity.groupId, name, entity.id);
      if (entity.name !== name) {
        entity.name = name;
        changed = true;
      }
    }
    if (input?.type !== undefined) {
      const type = normalizeInterfaceType(input.type);
      if (entity.type !== type) {
        entity.type = type;
        changed = true;
      }
    }
    if (input?.ipAddress !== undefined) {
      const ipAddress = normalizeIpAddress(input.ipAddress);
      if (entity.ipAddress !== ipAddress) {
        entity.ipAddress = ipAddress;
        changed = true;
      }
    }
    if (input?.port !== undefined) {
      const port = normalizePort(input.port);
      if (entity.port !== port) {
        entity.port = port;
        changed = true;
      }
    }
    if (input?.url !== undefined) {
      const url = normalizeUrl(input.url);
      if (entity.url !== url) {
        entity.url = url;
        changed = true;
      }
    }
    if (input?.httpMethod !== undefined) {
      const httpMethod = normalizeHttpMethod(input.httpMethod);
      if (entity.httpMethod !== httpMethod) {
        entity.httpMethod = httpMethod;
        changed = true;
      }
    }
    if (input?.responseData !== undefined) {
      const responseData = normalizeResponseData(input.responseData);
      if (entity.responseData !== responseData) {
        entity.responseData = responseData;
        changed = true;
      }
    }

    if (changed) {
      await this.interfaceRepo.save(entity);
    }

    const needsRestart =
      changed && entity.enabled && group.enabled && this.listeners.masterEnabled;

    return {
      message:
        changed && needsRestart
          ? '配置已保存，需重启 Mock 服务后生效'
          : changed
            ? '配置已保存'
            : '配置未发生变化',
      needsRestart,
      interface: this.toInterfaceDto(entity),
    };
  }

  async deleteInterface(id: string): Promise<MockDeleteResult> {
    const entity = await this.findInterface(id);
    await this.interfaceRepo.delete(entity.id);
    await this.listeners.disableInterface(entity.id);
    return { message: '接口已删除', needsRestart: false };
  }

  async enableInterface(id: string): Promise<MockToggleInterfaceResult> {
    const entity = await this.findInterface(id);
    const group = entity.group;

    // 总开关关闭或分组停用时，只记录启用状态，待总开关/重启后生效
    if (!group.enabled) {
      if (!entity.enabled) {
        entity.enabled = true;
        await this.interfaceRepo.save(entity);
      }
      return {
        message: '接口已启用，但所属分组已停用；启用分组并重启 Mock 服务后生效',
        enabled: true,
      };
    }

    if (!this.listeners.masterEnabled) {
      if (!entity.enabled) {
        entity.enabled = true;
        await this.interfaceRepo.save(entity);
      }
      return {
        message: '接口已启用，开启 Mock 服务总开关后生效',
        enabled: true,
      };
    }

    // 运行中：先确保监听成功，再保存启用状态；失败时配置保持停用
    const dto = this.toInterfaceDto(entity);
    await this.listeners.enableInterface(dto, group.name);
    if (!entity.enabled) {
      entity.enabled = true;
      await this.interfaceRepo.save(entity);
    }

    return { message: '接口已启用，监听已启动', enabled: true };
  }

  async disableInterface(id: string): Promise<MockToggleInterfaceResult> {
    const entity = await this.findInterface(id);
    await this.listeners.disableInterface(entity.id);
    if (entity.enabled) {
      entity.enabled = false;
      await this.interfaceRepo.save(entity);
    }
    return { message: '接口已停用，监听已停止', enabled: false };
  }

  async toggleMaster(input: ToggleMockMasterInput): Promise<MockMasterResult> {
    if (typeof input?.enabled !== 'boolean') {
      throw validationError('必须指定 enabled（布尔值）');
    }

    if (input.enabled) {
      if (this.listeners.masterEnabled) {
        return {
          ...this.listeners.status,
          message: 'Mock 服务已处于开启状态',
        };
      }
      const groups = await this.groupRepo.find({
        relations: { interfaces: true },
        order: { createdAt: 'ASC' },
      });
      await this.listeners.startAll(groups.map((group) => this.toGroupDto(group)));
      const status = this.listeners.status;
      return {
        ...status,
        message:
          status.runningInterfaces > 0
            ? `Mock 服务已开启，共启动 ${status.runningInterfaces} 个接口`
            : 'Mock 服务已开启，当前没有启用中的接口',
      };
    }

    await this.listeners.stopAll();
    return {
      ...this.listeners.status,
      message: 'Mock 服务已关闭，所有监听端口已释放',
    };
  }

  async restart(): Promise<MockMasterResult> {
    const groups = await this.groupRepo.find({
      relations: { interfaces: true },
      order: { createdAt: 'ASC' },
    });
    await this.listeners.startAll(groups.map((group) => this.toGroupDto(group)));
    const status = this.listeners.status;
    return {
      ...status,
      message:
        status.runningInterfaces > 0
          ? `Mock 服务已重启，共启动 ${status.runningInterfaces} 个接口`
          : 'Mock 服务已重启，当前没有启用中的接口',
    };
  }

  getStatus(): MockRuntimeStatus {
    return this.listeners.status;
  }

  getLogs(): RequestLog[] {
    return this.logs.list();
  }

  async shutdown(): Promise<void> {
    await this.listeners.stopAll();
  }

  private async findGroup(id: string): Promise<MockGroup> {
    const group = await this.groupRepo.findOne({
      where: { id },
      relations: { interfaces: true },
    });
    if (!group) {
      throw new AppError(404, 'MOCK_GROUP_NOT_FOUND', '分组不存在或已被删除');
    }
    return group;
  }

  private async findInterface(id: string): Promise<MockInterface> {
    const entity = await this.interfaceRepo.findOne({
      where: { id },
      relations: { group: true },
    });
    if (!entity) {
      throw new AppError(404, 'MOCK_INTERFACE_NOT_FOUND', '接口不存在或已被删除');
    }
    return entity;
  }

  private async assertGroupNameUnique(name: string, exceptId?: string): Promise<void> {
    const query = this.groupRepo
      .createQueryBuilder('g')
      .where('LOWER(g.name) = LOWER(:name)', { name });
    if (exceptId) {
      query.andWhere('g.id != :exceptId', { exceptId });
    }
    const existing = await query.getOne();
    if (existing) {
      throw new AppError(
        409,
        'MOCK_GROUP_NAME_DUPLICATE',
        `分组名称「${name}」已存在（名称不区分大小写）`,
      );
    }
  }

  private async assertInterfaceNameUnique(
    groupId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const query = this.interfaceRepo
      .createQueryBuilder('i')
      .where('i.groupId = :groupId', { groupId })
      .andWhere('LOWER(i.name) = LOWER(:name)', { name });
    if (exceptId) {
      query.andWhere('i.id != :exceptId', { exceptId });
    }
    const existing = await query.getOne();
    if (existing) {
      throw new AppError(
        409,
        'MOCK_INTERFACE_NAME_DUPLICATE',
        `同一分组下已存在接口「${name}」（名称不区分大小写）`,
      );
    }
  }

  private toGroupDto(group: MockGroup): MockGroupWithInterfaces {
    const interfaces = [...(group.interfaces ?? [])].sort((a, b) => {
      const timeDiff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return timeDiff !== 0 ? timeDiff : a.name.localeCompare(b.name, 'zh-CN');
    });
    return {
      id: group.id,
      name: group.name,
      enabled: group.enabled,
      createdAt: toIso(group.createdAt),
      updatedAt: toIso(group.updatedAt),
      interfaces: interfaces.map((item) => this.toInterfaceDto(item)),
    };
  }

  private toInterfaceDto(entity: MockInterface): MockInterfaceConfig {
    return {
      id: entity.id,
      groupId: entity.groupId,
      name: entity.name,
      type: entity.type as MockInterfaceType,
      ipAddress: entity.ipAddress ?? '',
      port: entity.port,
      url: entity.url,
      httpMethod: entity.httpMethod as MockHttpMethod,
      responseData: entity.responseData ?? '',
      enabled: entity.enabled,
      createdAt: toIso(entity.createdAt),
      updatedAt: toIso(entity.updatedAt),
    };
  }
}
