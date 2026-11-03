/** Mock 接口支持的协议类型 */
export const MOCK_INTERFACE_TYPES = ['WebApi', 'WebService', 'Socket'] as const;
export type MockInterfaceType = (typeof MOCK_INTERFACE_TYPES)[number];

/** Mock 接口支持的 HTTP 方法 */
export const MOCK_HTTP_METHODS = [
  'GET',
  'POST',
  'PUT',
  'PATCH',
  'DELETE',
  'HEAD',
  'OPTIONS',
] as const;
export type MockHttpMethod = (typeof MOCK_HTTP_METHODS)[number];

/** 接口配置（前后端共享） */
export interface MockInterfaceConfig {
  id: string;
  groupId: string;
  name: string;
  type: MockInterfaceType;
  /** 为空表示绑定 0.0.0.0（所有网卡） */
  ipAddress: string;
  port: number;
  url: string;
  httpMethod: MockHttpMethod;
  /** 多行响应文本；合法 JSON 会在返回前压缩 */
  responseData: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** 分组及组内接口 */
export interface MockGroupWithInterfaces {
  id: string;
  name: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  interfaces: MockInterfaceConfig[];
}

export interface CreateMockGroupInput {
  name: string;
  enabled?: boolean;
}

export interface UpdateMockGroupInput {
  name?: string;
  enabled?: boolean;
}

export interface CreateMockInterfaceInput {
  groupId: string;
  name: string;
  type: MockInterfaceType;
  ipAddress?: string;
  port?: number;
  url?: string;
  httpMethod?: MockHttpMethod;
  responseData?: string;
  enabled?: boolean;
}

/** 更新接口时不允许移动到其他分组 */
export interface UpdateMockInterfaceInput {
  name?: string;
  type?: MockInterfaceType;
  ipAddress?: string;
  port?: number;
  url?: string;
  httpMethod?: MockHttpMethod;
  responseData?: string;
  enabled?: boolean;
}

export interface MockGroupMutationResult {
  message: string;
  needsRestart: boolean;
  group: MockGroupWithInterfaces;
}

export interface MockInterfaceMutationResult {
  message: string;
  needsRestart: boolean;
  interface: MockInterfaceConfig;
}

export interface MockToggleInterfaceResult {
  message: string;
  enabled: boolean;
}

export interface MockDeleteResult {
  message: string;
  needsRestart: boolean;
}

export interface MockRuntimeStatus {
  masterEnabled: boolean;
  running: boolean;
  runningInterfaces: number;
  ports: number[];
}

export interface MockMasterResult extends MockRuntimeStatus {
  message: string;
}

export interface ToggleMockMasterInput {
  enabled: boolean;
}

/** 统一错误响应体 */
export interface ApiErrorPayload {
  code: string;
  message: string;
  details?: string;
}
