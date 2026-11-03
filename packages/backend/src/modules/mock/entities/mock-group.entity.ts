import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MockInterface } from './mock-interface.entity.js';

/** Mock 分组：名称唯一性（不区分大小写）由服务层保证 */
@Entity('mock_groups')
export class MockGroup {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 100 })
  name!: string;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @OneToMany(() => MockInterface, (item) => item.group)
  interfaces!: MockInterface[];

  @CreateDateColumn({ type: 'datetime' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'datetime' })
  updatedAt!: Date;
}
