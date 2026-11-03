/** 一次 Mock 请求的日志（只存内存） */
export interface RequestLog {
  id: string;
  /** ISO 8601 时间 */
  timestamp: string;
  method: string;
  /** 请求实际访问的路径（含 query） */
  url: string;
  /** 匹配到的接口 ID；未匹配时为空 */
  interfaceId?: string;
  interfaceName?: string;
  groupName?: string;
  statusCode: number;
  durationMs: number;
  ip: string;
  userAgent: string;
  /** 本次实际返回的响应体（便于排查） */
  responsePreview: string;
}

/** Socket.IO 事件名：后端 -> 前端 */
export const SOCKET_EVENT_NEW_LOG = 'new-log';

export interface ServerToClientEvents {
  [SOCKET_EVENT_NEW_LOG]: (log: RequestLog) => void;
}

export interface ClientToServerEvents {
  // 当前没有前端 -> 后端的业务事件
}
