<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import {
  Delete,
  Edit,
  Folder,
  Plus,
  Refresh,
  Search,
} from '@element-plus/icons-vue';
import type {
  MockGroupWithInterfaces,
  MockInterfaceConfig,
} from '@mytoolhub/shared';

interface TreeNode {
  key: string;
  label: string;
  kind: 'group' | 'interface';
  groupId: string;
  group?: MockGroupWithInterfaces;
  item?: MockInterfaceConfig;
  children?: TreeNode[];
}

const props = defineProps<{
  groups: MockGroupWithInterfaces[];
  selectedKey: string;
  busyId?: string;
}>();

const emit = defineEmits<{
  (event: 'select', payload: {
    type: 'group' | 'interface';
    groupId: string;
    interfaceId?: string;
  }): void;
  (event: 'add-group'): void;
  (event: 'add-interface', groupId: string): void;
  (event: 'edit-group', group: MockGroupWithInterfaces): void;
  (event: 'delete-group', group: MockGroupWithInterfaces): void;
  (event: 'delete-interface', item: MockInterfaceConfig): void;
  (event: 'toggle-interface', item: MockInterfaceConfig, enabled: boolean): void;
  (event: 'toggle-group', group: MockGroupWithInterfaces, enabled: boolean): void;
  (event: 'refresh'): void;
}>();

const treeRef = ref<{
  filter: (value: string) => void;
  setCurrentKey: (key?: string) => void;
} | null>(null);
const filterText = ref('');

const treeData = computed<TreeNode[]>(() =>
  props.groups.map((group) => ({
    key: 'group:' + group.id,
    label: group.name,
    kind: 'group',
    groupId: group.id,
    group,
    children: group.interfaces.map((item) => ({
      key: 'interface:' + item.id,
      label: item.name,
      kind: 'interface',
      groupId: group.id,
      item,
    })),
  })),
);

const totalInterfaces = computed(() =>
  props.groups.reduce((total, group) => total + group.interfaces.length, 0),
);

watch(
  () => props.selectedKey,
  async (key) => {
    await nextTick();
    treeRef.value?.setCurrentKey(key || undefined);
  },
  { immediate: true },
);

watch(filterText, (value) => {
  treeRef.value?.filter(value);
});

function filterNode(value: string, data: TreeNode): boolean {
  if (!value) return true;
  return data.label.toLowerCase().includes(value.trim().toLowerCase());
}

function handleNodeClick(data: TreeNode): void {
  if (data.kind === 'interface' && data.item) {
    emit('select', {
      type: 'interface',
      groupId: data.groupId,
      interfaceId: data.item.id,
    });
    return;
  }
  emit('select', { type: 'group', groupId: data.groupId });
}

function onInterfaceToggle(data: TreeNode, value: string | number | boolean): void {
  if (data.item) {
    emit('toggle-interface', data.item, Boolean(value));
  }
}

function onGroupToggle(data: TreeNode, value: string | number | boolean): void {
  if (data.group) {
    emit('toggle-group', data.group, Boolean(value));
  }
}
</script>

<template>
  <section class="tree-panel">
    <header class="tree-head">
      <div>
        <h2>分组与接口</h2>
        <p>{{ groups.length }} 个分组 · {{ totalInterfaces }} 个接口</p>
      </div>
      <div class="head-actions">
        <el-tooltip content="刷新" placement="top">
          <el-button circle size="small" :icon="Refresh" @click="emit('refresh')" />
        </el-tooltip>
        <el-tooltip content="新建分组" placement="top">
          <el-button
            type="primary"
            circle
            size="small"
            :icon="Plus"
            @click="emit('add-group')"
          />
        </el-tooltip>
      </div>
    </header>

    <el-input
      v-model="filterText"
      class="tree-search"
      placeholder="搜索分组或接口"
      clearable
      :prefix-icon="Search"
    />

    <div class="tree-scroll">
      <el-tree
        ref="treeRef"
        :data="treeData"
        node-key="key"
        default-expand-all
        highlight-current
        :expand-on-click-node="false"
        :filter-node-method="filterNode"
        @node-click="handleNodeClick"
      >
        <template #default="{ data }">
          <div v-if="data.kind === 'group'" class="node-row group-row">
            <el-icon class="folder-icon"><Folder /></el-icon>
            <span class="node-label" :title="data.label">{{ data.label }}</span>
            <span class="node-count">{{ data.group?.interfaces.length ?? 0 }}</span>
            <div class="node-actions group-actions" @click.stop>
              <el-switch
                :model-value="data.group?.enabled"
                size="small"
                :loading="busyId === 'group:' + data.groupId"
                @change="(value: string | number | boolean) => onGroupToggle(data, value)"
              />
              <button
                type="button"
                class="mini-action"
                title="新建接口"
                @click="emit('add-interface', data.groupId)"
              >
                <el-icon><Plus /></el-icon>
              </button>
              <button
                type="button"
                class="mini-action"
                title="编辑分组"
                @click="data.group && emit('edit-group', data.group)"
              >
                <el-icon><Edit /></el-icon>
              </button>
              <button
                type="button"
                class="mini-action danger"
                title="删除分组"
                @click="data.group && emit('delete-group', data.group)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>

          <div v-else class="node-row interface-row">
            <el-tag
              size="small"
              effect="plain"
              class="method-tag"
              :type="data.item?.httpMethod === 'GET' ? 'success' : data.item?.httpMethod === 'DELETE' ? 'danger' : 'primary'"
            >
              {{ data.item?.httpMethod }}
            </el-tag>
            <span class="node-label" :title="data.label">{{ data.label }}</span>
            <div class="node-actions" @click.stop>
              <el-switch
                :model-value="data.item?.enabled"
                size="small"
                :loading="busyId === data.item?.id"
                @change="(value: string | number | boolean) => onInterfaceToggle(data, value)"
              />
              <button
                type="button"
                class="mini-action danger"
                title="删除接口"
                @click="data.item && emit('delete-interface', data.item)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </div>
        </template>
      </el-tree>

      <el-empty
        v-if="groups.length === 0"
        :image-size="72"
        description="还没有分组，先创建一个吧"
      >
        <el-button type="primary" :icon="Plus" @click="emit('add-group')">
          新建分组
        </el-button>
      </el-empty>
    </div>

    <footer class="tree-foot">
      接口开关即时生效；点击节点可在右侧编辑配置
    </footer>
  </section>
</template>

<style scoped>
.tree-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
}

.tree-head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 17px 16px 11px;
}

.tree-head h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.tree-head p {
  margin: 4px 0 0;
  font-size: 10.5px;
  color: #94a3b8;
}

.head-actions {
  display: flex;
  gap: 6px;
}

.tree-search {
  width: auto;
  margin: 0 14px 8px;
}

.tree-scroll {
  flex: 1;
  min-height: 0;
  padding: 2px 8px 8px;
  overflow: auto;
}

.tree-scroll :deep(.el-tree) {
  --el-tree-node-hover-bg-color: #f8fafc;
  background: transparent;
}

.tree-scroll :deep(.el-tree-node__content) {
  height: auto;
  min-height: 36px;
  padding-right: 4px;
  border-radius: 8px;
}

.tree-scroll :deep(.el-tree-node.is-current > .el-tree-node__content) {
  background: #eef2ff;
}

.tree-scroll :deep(.el-tree-node__expand-icon) {
  color: #94a3b8;
}

.node-row {
  display: flex;
  flex: 1;
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 3px 0;
}

.folder-icon {
  flex: 0 0 auto;
  color: #f59e0b;
}

.node-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-size: 12px;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-row .node-label {
  font-weight: 650;
}

.node-count {
  padding: 1px 6px;
  font-size: 9px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 999px;
}

.node-actions {
  display: flex;
  gap: 2px;
  align-items: center;
}

/* 启用开关常显，操作按钮悬停时再出现，避免误触 */
.node-actions .mini-action {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.node-row:hover .mini-action,
.node-row:focus-within .mini-action {
  opacity: 1;
}

.group-actions {
  gap: 3px;
}

.mini-action {
  display: grid;
  width: 24px;
  height: 24px;
  color: #64748b;
  background: transparent;
  border: 0;
  border-radius: 6px;
  place-items: center;
  cursor: pointer;
}

.mini-action:hover {
  color: var(--brand-primary);
  background: #eef2ff;
}

.mini-action.danger:hover {
  color: #dc2626;
  background: #fef2f2;
}

.method-tag {
  flex: 0 0 auto;
  width: 48px;
  font-family: var(--font-mono);
  font-size: 9px;
  text-align: center;
}

.tree-foot {
  padding: 9px 14px;
  font-size: 9.5px;
  line-height: 1.5;
  color: #94a3b8;
  background: #fafbfc;
  border-top: 1px solid #f1f5f9;
}

@media (max-width: 768px) {
  .node-actions .mini-action {
    opacity: 1;
  }

  .group-actions .mini-action:nth-of-type(2) {
    display: none;
  }
}
</style>
