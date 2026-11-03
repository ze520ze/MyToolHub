# 如何新增一个功能模块

本文以新增“串口调试”为例，完整演示从后端模块到前端页面的接入过程。示例只实现“端口列表 + 打开/关闭”的骨架，不依赖任何串口库；接入真实串口时，只需要在服务层替换具体实现。

新增功能只需要改三个地方：

1. 后端新增一个模块目录，并导出 `BackendModule` 对象。
2. 前端新增页面、API 封装和一条带 `meta` 的路由。
3. 把后端模块加入注册表，把前端路由加入导航表。

不需要修改 `App.vue`、`HomeView.vue`、主布局或首页卡片代码。

---

## 0. 先约定命名和接口

假设串口模块叫 `serial`：

| 内容 | 位置 / 命名 |
| --- | --- |
| 共享类型 | `packages/shared/src/types/serial.types.ts` |
| 后端模块 | `packages/backend/src/modules/serial/` |
| API 前缀 | `/api/serial` |
| 前端页面 | `packages/frontend/src/views/serial/SerialView.vue` |
| 前端 API | `packages/frontend/src/api/serial.api.ts` |
| 路由 name | `SerialTool` |
| 路由 path | `/serial` |

后端目录建议保持和 Mock 模块一致：

    packages/backend/src/modules/serial/
    ├── index.ts             模块入口，组装依赖
    ├── serial.routes.ts     只负责 HTTP 路由
    ├── serial.service.ts    业务逻辑
    └── serial.types.ts      仅后端内部使用的类型（可选）

---

## 1. 定义前后端共享类型

新建 `packages/shared/src/types/serial.types.ts`：

    /** 一个串口的基本信息 */
    export interface SerialPortSummary {
      path: string;
      baudRate: number;
      open: boolean;
      description?: string;
    }

    /** 打开串口的请求参数 */
    export interface OpenSerialInput {
      path: string;
      baudRate?: number;
    }

    /** 打开/关闭串口后的返回 */
    export interface SerialOperationResult {
      message: string;
      port: SerialPortSummary;
    }

然后在 `packages/shared/src/index.ts` 末尾追加一行：

    export * from './types/serial.types.js';

共享包直接导出 TypeScript 源码，前后端都通过包名 `@mytoolhub/shared` 引用，不需要单独构建。

---

## 2. 编写后端服务层

新建 `packages/backend/src/modules/serial/serial.service.ts`。

服务层负责校验、状态和业务错误；路由层只转发参数。

    import type {
      OpenSerialInput,
      SerialOperationResult,
      SerialPortSummary,
    } from '@mytoolhub/shared';
    import { AppError } from '../../utils/errors.js';

    /**
     * 串口服务。
     * 这里用 Map 模拟端口状态；接入真实串口时，
     * 把 open/close 替换成 serialport 的对应调用即可。
     */
    export class SerialService {
      private readonly ports = new Map<string, SerialPortSummary>();

      constructor() {
        // 示例数据，真实实现可以改为扫描系统串口
        this.ports.set('COM3', {
          path: 'COM3',
          baudRate: 115200,
          open: false,
          description: '示例串口',
        });
      }

      list(): SerialPortSummary[] {
        return [...this.ports.values()];
      }

      open(input: OpenSerialInput): SerialOperationResult {
        const path = input.path?.trim().toUpperCase();
        if (!path) {
          throw new AppError(400, 'VALIDATION_ERROR', '串口名称不能为空');
        }

        const baudRate = input.baudRate ?? 115200;
        if (!Number.isInteger(baudRate) || baudRate <= 0) {
          throw new AppError(400, 'VALIDATION_ERROR', '波特率必须是正整数');
        }

        const port = this.ports.get(path);
        if (!port) {
          throw new AppError(404, 'SERIAL_PORT_NOT_FOUND', '未找到串口 ' + path);
        }
        if (port.open) {
          throw new AppError(409, 'SERIAL_PORT_ALREADY_OPEN', '串口 ' + path + ' 已经打开');
        }

        port.open = true;
        port.baudRate = baudRate;
        return { message: '串口已打开', port: { ...port } };
      }

      close(path: string): SerialOperationResult {
        const normalized = path.trim().toUpperCase();
        const port = this.ports.get(normalized);
        if (!port) {
          throw new AppError(404, 'SERIAL_PORT_NOT_FOUND', '未找到串口 ' + normalized);
        }
        if (!port.open) {
          throw new AppError(409, 'SERIAL_PORT_NOT_OPEN', '串口 ' + normalized + ' 尚未打开');
        }

        port.open = false;
        return { message: '串口已关闭', port: { ...port } };
      }

      /** 进程退出时释放资源；真实串口实现应在这里关闭所有连接 */
      async shutdown(): Promise<void> {
        for (const port of this.ports.values()) {
          port.open = false;
        }
      }
    }

说明：

- `AppError` 的参数顺序是 `(statusCode, code, message, details?)`。
- 业务错误统一抛出 `AppError`，由 `app.ts` 的 `setErrorHandler` 转成 `{ code, message }`。
- 需要持久化时，参考 Mock 模块：在模块目录下建 `entities/`，并在 `packages/backend/src/db/data-source.ts` 的 `entities` 数组中注册实体。

---

## 3. 编写后端路由

新建 `packages/backend/src/modules/serial/serial.routes.ts`：

    import type { FastifyInstance } from 'fastify';
    import type { OpenSerialInput } from '@mytoolhub/shared';
    import type { SerialService } from './serial.service.js';

    interface PortParams {
      path: string;
    }

    /**
     * 串口模块的 HTTP 路由。
     * 这里只做参数转发，校验和状态都在 SerialService 中。
     */
    export async function registerSerialRoutes(
      app: FastifyInstance,
      service: SerialService,
    ): Promise<void> {
      app.get('/ports', async () => service.list());

      app.post<{ Body: OpenSerialInput }>('/ports/open', async (request) => {
        return service.open(request.body);
      });

      app.post<{ Params: PortParams }>('/ports/:path/close', async (request) => {
        return service.close(request.params.path);
      });
    }

注意：当前后端是 ESM（`package.json` 中 `"type": "module"`），相对导入要写 `.js` 后缀，例如 `./serial.service.js`。TypeScript 会自动解析到对应的 `.ts` 文件。

---

## 4. 导出模块并注册

新建 `packages/backend/src/modules/serial/index.ts`：

    import type { BackendModule } from '../../plugins/register-modules.js';
    import { registerSerialRoutes } from './serial.routes.js';
    import { SerialService } from './serial.service.js';

    /**
     * 串口模块。
     * 模块自己创建依赖，主壳只负责调用 register。
     */
    export const serialModule: BackendModule = {
      name: 'serial',
      async register(app) {
        const service = new SerialService();

        // 使用独立作用域注册，避免不同模块的路由前缀互相影响
        app.register(
          async (scope) => {
            await registerSerialRoutes(scope, service);
          },
          { prefix: '/api/serial' },
        );

        // 进程退出时释放串口等资源
        app.addHook('onClose', async () => {
          await service.shutdown();
        });
      },
    };

打开 `packages/backend/src/plugins/register-modules.ts`，增加 import 和数组项：

    import { serialModule } from '../modules/serial/index.js';

    const modules: BackendModule[] = [
      mockModule,
      serialModule,
      // 未来：protocolModule, ...
    ];

启动后端后，日志里会出现：

    模块已加载: serial

此时可以先用 HTTP 工具验证：

    GET  http://localhost:3000/api/serial/ports
    POST http://localhost:3000/api/serial/ports/open
         { "path": "COM3", "baudRate": 115200 }

---

## 5. 前端 API 封装

新建 `packages/frontend/src/api/serial.api.ts`，统一通过 `http` 实例发请求：

    import type {
      OpenSerialInput,
      SerialOperationResult,
      SerialPortSummary,
    } from '@mytoolhub/shared';
    import { http } from './http';

    export const serialApi = {
      async getPorts(): Promise<SerialPortSummary[]> {
        const { data } = await http.get<SerialPortSummary[]>('/serial/ports');
        return data;
      },

      async open(input: OpenSerialInput): Promise<SerialOperationResult> {
        const { data } = await http.post<SerialOperationResult>(
          '/serial/ports/open',
          input,
        );
        return data;
      },

      async close(path: string): Promise<SerialOperationResult> {
        const { data } = await http.post<SerialOperationResult>(
          '/serial/ports/' + encodeURIComponent(path) + '/close',
        );
        return data;
      },
    };

`http` 的 `baseURL` 已经是 `/api`，所以这里写 `/serial/ports`，不要重复写 `/api`。

---

## 6. 编写前端页面

新建 `packages/frontend/src/views/serial/SerialView.vue`。先做一个可用的最小页面，后续再按需要加图表、日志或 Pinia store。

    <script setup lang="ts">
    import { onMounted, ref } from 'vue';
    import { ElMessage } from 'element-plus';
    import type { SerialPortSummary } from '@mytoolhub/shared';
    import { serialApi } from '@/api/serial.api';
    import { getErrorMessage } from '@/api/http';

    const ports = ref<SerialPortSummary[]>([]);
    const loading = ref(false);
    const busyPath = ref('');

    async function loadPorts(): Promise<void> {
      loading.value = true;
      try {
        ports.value = await serialApi.getPorts();
      } catch (error) {
        ElMessage.error(getErrorMessage(error));
      } finally {
        loading.value = false;
      }
    }

    async function toggle(port: SerialPortSummary): Promise<void> {
      busyPath.value = port.path;
      try {
        const result = port.open
          ? await serialApi.close(port.path)
          : await serialApi.open({ path: port.path, baudRate: port.baudRate });
        ElMessage.success(result.message);
        await loadPorts();
      } catch (error) {
        ElMessage.error(getErrorMessage(error));
      } finally {
        busyPath.value = '';
      }
    }

    onMounted(loadPorts);
    </script>

    <template>
      <section class="serial-page">
        <header class="page-head">
          <div>
            <h1>串口调试</h1>
            <p>查看本机串口，打开或关闭连接</p>
          </div>
          <el-button :loading="loading" @click="loadPorts">刷新</el-button>
        </header>

        <el-table v-loading="loading" :data="ports" border>
          <el-table-column prop="path" label="串口" width="140" />
          <el-table-column prop="description" label="说明" />
          <el-table-column prop="baudRate" label="波特率" width="120" />
          <el-table-column label="状态" width="100">
            <template #default="{ row }">
              <el-tag :type="row.open ? 'success' : 'info'">
                {{ row.open ? '已打开' : '未打开' }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="操作" width="120">
            <template #default="{ row }">
              <el-button
                :loading="busyPath === row.path"
                :type="row.open ? 'danger' : 'primary'"
                link
                @click="toggle(row)"
              >
                {{ row.open ? '关闭' : '打开' }}
              </el-button>
            </template>
          </el-table-column>
        </el-table>
      </section>
    </template>

    <style scoped>
    .serial-page {
      padding: 4px;
    }

    .page-head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      margin-bottom: 18px;
    }

    .page-head h1 {
      margin: 0;
      font-size: 22px;
    }

    .page-head p {
      margin: 6px 0 0;
      color: #64748b;
    }
    </style>

页面内容区由主壳的 `App.vue` 提供，不需要再写侧边栏或顶栏。

---

## 7. 添加路由，首页卡片自动出现

打开 `packages/frontend/src/router/index.ts`，在 `navigationRoutes` 中追加：

    {
      path: '/serial',
      name: 'SerialTool',
      component: () => import('@/views/serial/SerialView.vue'),
      meta: {
        title: '串口调试',
        icon: 'Cpu',
        description: '查看串口、打开连接并调试收发',
        order: 2,
        showInMenu: true,
      },
    },

字段说明：

| 字段 | 作用 |
| --- | --- |
| `title` | 页面标题、侧边栏文字、首页卡片标题 |
| `icon` | Element Plus 图标组件名，例如 `Cpu`、`Connection` |
| `description` | 首页卡片描述 |
| `order` | 导航排序，越小越靠前 |
| `showInMenu` | 是否显示在侧边栏和首页 |
| `headerAction` | 可选，顶栏功能开关的注册名；没有就不写 |

保存后刷新页面：

- 左侧导航出现“串口调试”。
- 首页“功能模块”自动多出一张卡片。
- 点击卡片进入 `/serial`。

首页和侧边栏都读取 `navigationItems`，所以 **不需要改 HomeView.vue 或 App.vue**。

---

## 8. 可选：需要 Pinia 状态时

如果页面状态会被多个组件共享（例如串口连接状态、实时日志），再增加 store：

    packages/frontend/src/stores/serial.store.ts

参考 `stores/mock.store.ts` 的写法：`defineStore` + `ref`，把 API 调用、loading、错误处理收在 store 中，页面只调用 action。只有单个页面使用的状态，优先留在页面里，避免过度抽象。

---

## 9. 验证清单

新增模块后按顺序检查：

1. `pnpm typecheck` 通过，没有相对导入缺少 `.js` 的报错。
2. `pnpm dev` 启动后，后端日志出现“模块已加载: serial”。
3. `GET /api/serial/ports` 返回预期数据。
4. 前端侧边栏出现新入口，首页出现新卡片。
5. 进入页面能加载数据，操作失败时能看到中文错误提示。
6. `pnpm build` 通过，生产模式访问 `http://localhost:3000` 时刷新 `/serial` 不会 404。
7. 如果模块持有定时器、监听器、串口或数据库连接，确认在 `onClose` 中释放。

---

## 10. 常见问题

### 路由注册了但首页没有卡片

检查路由的 `meta.showInMenu` 是否为 `true`，`title` 和 `description` 是否填写。首页只读取 `navigationRoutes`，不读取普通 `routes`。

### 后端启动时报“Cannot find module './xxx.js'”

这是 ESM 的相对导入规则。所有后端相对导入都写 `.js` 后缀，即使源文件是 `.ts`。

### 前端请求 404

确认后端路由前缀是 `/api/serial`，前端 API 写的是 `/serial/...`。`http` 已经自动加了 `/api`。

### 业务错误没有返回中文

在服务层抛出 `AppError`，不要在路由里直接 `throw new Error`。全局错误处理只会把 `AppError` 的 `code` 和 `message` 原样返回。

### 需要数据库表

1. 在模块目录下新建 `entities/xxx.entity.ts`。
2. 在 `packages/backend/src/db/data-source.ts` 的 `entities` 数组中注册。
3. 开发阶段依赖 `synchronize: true` 自动建表；个人项目不写迁移脚本。
4. 不要把数据库文件提交到 Git，`packages/backend/data/` 已被忽略。

---

## 11. 最小改动总结

新增一个功能模块，最终只需要：

- 新增 `packages/shared/src/types/serial.types.ts` 并在 `index.ts` 导出。
- 新增 `packages/backend/src/modules/serial/` 下的 `index.ts`、`serial.routes.ts`、`serial.service.ts`。
- 在 `packages/backend/src/plugins/register-modules.ts` 的 `modules` 数组加一项。
- 新增 `packages/frontend/src/api/serial.api.ts`。
- 新增 `packages/frontend/src/views/serial/SerialView.vue`。
- 在 `packages/frontend/src/router/index.ts` 的 `navigationRoutes` 加一项。

主壳、首页、布局、导航组件都不需要改。
