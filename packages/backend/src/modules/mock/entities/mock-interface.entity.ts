import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
// 仅类型引用：避免 ESM 下与 MockGroup 形成循环依赖（TypeORM 通过字符串解析关系目标）
import type { MockGroup } from './mock-group.entity.js';

/** Mock 接口配置：响应数据使用 text，支持多行文本 */
@Entity('mock_interfaces')
export class MockInterface {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 36 })
  groupId!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'varchar', length: 20, default: 'WebApi' })
  type!: string;

  @Column({ type: 'varchar', length: 100, default: '' })
  ipAddress!: string;

  @Column({ type: 'integer', default: 8080 })
  port!: number;

  @Column({ type: 'varchar', length: 500, default: '/api/test' })
  url!: string;

  @Column({ type: 'varchar', length: 10, default: 'GET' })
  httpMethod!: string;

  @Column({ type: 'text', default: '' })
  responseData!: string;

  @Column({ type: 'boolean', default: false })
  enabled!: boolean;

  @ManyToOne('MockGroup', 'interfaces', {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'groupId' })
  group!: MockGroup;

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
