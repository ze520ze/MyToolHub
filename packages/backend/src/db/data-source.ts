import 'reflect-metadata';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataSource } from 'typeorm';
import { MockGroup } from '../modules/mock/entities/mock-group.entity.js';
import { MockInterface } from '../modules/mock/entities/mock-interface.entity.js';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** 数据库路径；可用 TOOLHUB_DB_PATH 覆盖（测试或多实例时很有用） */
export const DB_PATH =
  process.env.TOOLHUB_DB_PATH ?? resolve(backendRoot, 'data', 'toolhub.db');

mkdirSync(dirname(DB_PATH), { recursive: true });

/** 个人项目直接 synchronize，不维护迁移脚本 */
export const AppDataSource = new DataSource({
  type: 'better-sqlite3',
  database: DB_PATH,
  entities: [MockGroup, MockInterface],
  synchronize: true,
  logging: false,
});
