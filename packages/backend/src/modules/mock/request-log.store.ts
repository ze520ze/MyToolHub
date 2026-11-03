import type { RequestLog } from '@mytoolhub/shared';

/** 请求日志只保存在内存，最多 500 条，重启后清空 */
export class RequestLogStore {
  private readonly items: RequestLog[] = [];

  constructor(private readonly maxSize = 500) {}

  add(log: RequestLog): void {
    this.items.unshift(log);
    if (this.items.length > this.maxSize) {
      this.items.length = this.maxSize;
    }
  }

  list(): RequestLog[] {
    return [...this.items];
  }
}
