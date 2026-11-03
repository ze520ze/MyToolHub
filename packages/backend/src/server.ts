import 'reflect-metadata';
import { buildApp } from './app.js';

const rawPort = process.env.PORT ?? '3000';
const port = Number(rawPort);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`无效的 PORT 环境变量: ${rawPort}`);
  process.exit(1);
}
const host = process.env.HOST ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = await buildApp();

  const shutdown = async (signal: string, exitCode = 0): Promise<void> => {
    app.log.info(`收到 ${signal}，正在关闭服务...`);
    try {
      await app.close();
      process.exit(exitCode);
    } catch (error) {
      console.error('关闭服务失败', error);
      process.exit(1);
    }
  };

  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  try {
    await app.listen({ port, host });
    app.log.info(`MyToolHub 已启动: http://localhost:${port}`);
    if (host === '0.0.0.0') {
      app.log.info(`局域网访问: http://<本机 IP>:${port}（手机与电脑需在同一局域网）`);
    }
  } catch (error) {
    app.log.error(error, '服务启动失败');
    await app.close().catch(() => undefined);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('MyToolHub 启动失败', error);
  process.exit(1);
});
