<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  ArrowRight,
  Back,
  Delete,
  Edit,
  FolderAdd,
  FolderOpened,
  Menu,
  Plus,
  RefreshRight,
} from '@element-plus/icons-vue';
import type {
  MockGroupWithInterfaces,
  MockHttpMethod,
  MockInterfaceConfig,
  MockInterfaceType,
} from '@mytoolhub/shared';
import GroupEditor from '@/components/mock/GroupEditor.vue';
import GroupTree from '@/components/mock/GroupTree.vue';
import InterfaceEditor from '@/components/mock/InterfaceEditor.vue';
import LogPanel from '@/components/mock/LogPanel.vue';
import { getErrorMessage } from '@/api/http';
import { useMockStore } from '@/stores/mock.store';
import { formatDateTime, methodTagType } from '@/utils/format';

interface TreeSelectPayload {
  type: 'group' | 'interface';
  groupId: string;
  interfaceId?: string;
}

interface InterfaceSubmitPayload {
  name: string;
  type: MockInterfaceType;
  ipAddress: string;
  port: number;
  url: string;
  httpMethod: MockHttpMethod;
  responseData: string;
}

type StatusTag = 'success' | 'info' | 'warning' | 'danger' | 'primary';

const store = useMockStore();
const isMobile = useMediaQuery('(max-width: 768px)');

const selectedKey = ref('');
const creating = ref(false);
const activeTab = ref<'config' | 'logs'>('config');
const configDirty = ref(false);
const editorNonce = ref(0);
const busyId = ref('');
const interfaceSaving = ref(false);
const treeDrawer = ref(false);

const groupDialogVisible = ref(false);
const groupDialogMode = ref<'create' | 'edit'>('create');
const groupDialogTarget = ref<MockGroupWithInterfaces | null>(null);
const groupSaving = ref(false);

/* ------------------------------ 选中项计算 ------------------------------ */

const selectedGroup = computed<MockGroupWithInterfaces | null>(() => {
  const key = selectedKey.value;
  if (key.startsWith('group:')) {
    const id = key.slice(6);
    return store.groups.find((group) => group.id === id) ?? null;
  }
  if (key.startsWith('interface:')) {
    const id = key.slice(10);
    return (
      store.groups.find((group) =>
        group.interfaces.some((item) => item.id === id),
      ) ?? null
    );
  }
  return null;
});

const selectedInterface = computed<MockInterfaceConfig | null>(() => {
  if (!selectedKey.value.startsWith('interface:')) return null;
  const id = selectedKey.value.slice(10);
  for (const group of store.groups) {
    const found = group.interfaces.find((item) => item.id === id);
    if (found) return found;
  }
  return null;
});

const editorItem = computed(() =>
  creating.value ? null : selectedInterface.value,
);

const showEditor = computed(
  () => Boolean(selectedGroup.value) && (creating.value || Boolean(selectedInterface.value)),
);

const interfaceMode = computed<'create' | 'edit'>(() =>
  editorItem.value ? 'edit' : 'create',
);

const selectionTitle = computed(
  () =>
    selectedInterface.value?.name ??
    selectedGroup.value?.name ??
    'Mock 服务器',
);

const selectionEyebrow = computed(() => {
  if (selectedInterface.value) return selectedGroup.value?.name ?? '接口';
  if (selectedGroup.value) return '分组概览';
  return 'Mock Server';
});

const groupPorts = computed<number[]>(() => {
  if (!selectedGroup.value) return [];
  return [...new Set(selectedGroup.value.interfaces.map((item) => item.port))].sort(
    (a, b) => a - b,
  );
});

const groupEnabledCount = computed(
  () => selectedGroup.value?.interfaces.filter((item) => item.enabled).length ?? 0,
);

const groupRunningCount = computed(() => {
  if (!selectedGroup.value) return 0;
  if (!store.status.masterEnabled || !selectedGroup.value.enabled) return 0;
  return groupEnabledCount.value;
});

const runtimeText = computed(() => {
  if (!store.status.masterEnabled) return '总开关已关闭';
  const portText =
    store.status.ports.length > 0 ? ' · ' + store.status.ports.length + ' 个端口' : '';
  return '运行中 · ' + store.status.runningInterfaces + ' 个接口' + portText;
});

const logCount = computed(() => store.logs.length);

const serviceRunningForEditor = computed(
  () =>
    Boolean(store.status.masterEnabled) &&
    Boolean(selectedGroup.value?.enabled) &&
    Boolean(selectedInterface.value?.enabled),
);

/* ------------------------------ 选择与初始化 ------------------------------ */

function ensureSelection(): void {
  if (store.groups.length === 0) {
    selectedKey.value = '';
    creating.value = false;
    return;
  }
  if (selectedKey.value.startsWith('interface:') && selectedInterface.value) return;
  if (selectedKey.value.startsWith('group:') && selectedGroup.value) return;

  const first = store.groups[0];
  if (!first) return;
  selectedKey.value = 'group:' + first.id;
  creating.value = false;
}

watch(() => store.groups, ensureSelection, { immediate: true });

onMounted(() => {
  void store.initialize().catch(() => undefined);
});

async function retryInit(): Promise<void> {
  try {
    await store.initialize();
  } catch {
    // 错误信息已写入 store.initError，由页面展示
  }
}

/* ------------------------------ 提示与通用操作 ------------------------------ */

function showError(error: unknown): void {
  ElMessage({
    type: 'error',
    message: getErrorMessage(error),
    duration: 6000,
    showClose: true,
  });
}

async function confirmDiscardIfNeeded(
  message = '当前接口有未保存的修改，继续操作将丢失这些内容。是否继续？',
): Promise<boolean> {
  if (!configDirty.value) return true;
  try {
    await ElMessageBox.confirm(message, '未保存的修改', {
      confirmButtonText: '放弃修改',
      cancelButtonText: '返回编辑',
      type: 'warning',
    });
    return true;
  } catch {
    return false;
  }
}

async function promptRestart(message: string): Promise<void> {
  try {
    await ElMessageBox.confirm(message + ' 是否立即重启 Mock 服务？', '需要重启生效', {
      confirmButtonText: '立即重启',
      cancelButtonText: '稍后手动重启',
      type: 'warning',
      distinguishCancelAndClose: true,
    });
  } catch {
    ElMessage.info('配置已保存，可稍后点击右上角「重启」按钮');
    return;
  }

  try {
    const result = await store.restart();
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  }
}

async function handleRefresh(): Promise<void> {
  if (!(await confirmDiscardIfNeeded('刷新会从服务器重新读取配置，未保存的修改将丢失。'))) {
    return;
  }
  try {
    await store.refresh();
    editorNonce.value += 1;
    configDirty.value = false;
    ElMessage.success('配置已刷新');
  } catch (error) {
    showError(error);
  }
}

async function handleRestart(): Promise<void> {
  if (!store.status.masterEnabled) {
    ElMessage.info('总开关关闭时无需重启，请先开启总开关');
    return;
  }
  try {
    await ElMessageBox.confirm(
      '重启会暂时断开所有 Mock 监听，并重新加载当前已启用的接口。是否继续？',
      '重启 Mock 服务',
      {
        confirmButtonText: '立即重启',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  try {
    const result = await store.restart();
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  }
}

async function enableMaster(): Promise<void> {
  try {
    const result = await store.setMaster(true);
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  }
}

/* ------------------------------ 分组树交互 ------------------------------ */

async function selectTarget(key: string): Promise<void> {
  treeDrawer.value = false;
  if (key === selectedKey.value && !creating.value) return;
  if (!(await confirmDiscardIfNeeded())) return;

  selectedKey.value = key;
  creating.value = false;
  configDirty.value = false;
  activeTab.value = 'config';
}

async function handleTreeSelect(payload: TreeSelectPayload): Promise<void> {
  if (payload.type === 'interface' && payload.interfaceId) {
    await selectTarget('interface:' + payload.interfaceId);
    return;
  }
  await selectTarget('group:' + payload.groupId);
}

function openCreateGroup(): void {
  treeDrawer.value = false;
  groupDialogMode.value = 'create';
  groupDialogTarget.value = null;
  groupDialogVisible.value = true;
}

function handleEditGroup(group: MockGroupWithInterfaces): void {
  treeDrawer.value = false;
  groupDialogMode.value = 'edit';
  groupDialogTarget.value = group;
  groupDialogVisible.value = true;
}

async function submitGroup(payload: { name: string; enabled: boolean }): Promise<void> {
  groupSaving.value = true;
  try {
    if (groupDialogMode.value === 'edit' && groupDialogTarget.value) {
      const targetId = groupDialogTarget.value.id;
      const result = await store.updateGroup(targetId, payload);
      groupDialogVisible.value = false;
      selectedKey.value = 'group:' + targetId;
      creating.value = false;
      configDirty.value = false;
      editorNonce.value += 1;
      if (result.needsRestart) {
        await promptRestart(result.message);
      } else {
        ElMessage.success(result.message);
      }
    } else {
      const result = await store.createGroup(payload);
      groupDialogVisible.value = false;
      selectedKey.value = 'group:' + result.group.id;
      creating.value = false;
      configDirty.value = false;
      editorNonce.value += 1;
      ElMessage.success(result.message);
    }
  } catch (error) {
    showError(error);
  } finally {
    groupSaving.value = false;
  }
}

async function handleDeleteGroup(group: MockGroupWithInterfaces): Promise<void> {
  treeDrawer.value = false;
  try {
    await ElMessageBox.confirm(
      '删除分组「' +
        group.name +
        '」会同时删除其下 ' +
        group.interfaces.length +
        ' 个接口，且无法恢复。是否继续？',
      '删除分组',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  try {
    const result = await store.deleteGroup(group.id);
    creating.value = false;
    configDirty.value = false;
    editorNonce.value += 1;
    ensureSelection();
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  }
}

async function handleDeleteInterface(item: MockInterfaceConfig): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '删除接口「' + item.name + '」后配置无法恢复，已启用的监听会立即停止。是否继续？',
      '删除接口',
      {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }

  try {
    const wasSelected = selectedInterface.value?.id === item.id;
    const groupId = item.groupId;
    const result = await store.deleteInterface(item.id);
    if (wasSelected) {
      selectedKey.value = 'group:' + groupId;
      creating.value = false;
      configDirty.value = false;
      editorNonce.value += 1;
    }
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  }
}

async function handleToggleGroup(
  group: MockGroupWithInterfaces,
  enabled: boolean,
): Promise<void> {
  busyId.value = 'group:' + group.id;
  try {
    const result = await store.updateGroup(group.id, { enabled });
    if (result.needsRestart) {
      await promptRestart(result.message);
    } else {
      ElMessage.success(result.message);
    }
  } catch (error) {
    showError(error);
  } finally {
    busyId.value = '';
  }
}

async function handleToggleInterface(
  item: MockInterfaceConfig,
  enabled: boolean,
): Promise<void> {
  const affectsEditor = selectedInterface.value?.id === item.id;

  if (affectsEditor && configDirty.value) {
    const ok = await confirmDiscardIfNeeded(
      '切换当前接口的启用状态会刷新配置，未保存的修改将丢失。是否继续？',
    );
    if (!ok) {
      await store.refresh().catch(() => undefined);
      return;
    }
  }

  busyId.value = item.id;
  try {
    const result = await store.toggleInterface(item.id, enabled);
    if (affectsEditor) {
      editorNonce.value += 1;
      configDirty.value = false;
    }
    ElMessage.success(result.message);
  } catch (error) {
    showError(error);
  } finally {
    busyId.value = '';
  }
}

/* ------------------------------ 接口编辑 ------------------------------ */

async function openCreateInterface(groupId?: string): Promise<void> {
  const targetGroupId = groupId ?? selectedGroup.value?.id;
  if (!targetGroupId) return;
  if (!(await confirmDiscardIfNeeded())) return;

  treeDrawer.value = false;
  selectedKey.value = 'group:' + targetGroupId;
  creating.value = true;
  configDirty.value = false;
  activeTab.value = 'config';
}

async function selectInterface(item: MockInterfaceConfig): Promise<void> {
  await selectTarget('interface:' + item.id);
}

async function backToGroupOverview(): Promise<void> {
  if (!selectedGroup.value) return;
  if (!(await confirmDiscardIfNeeded())) return;
  selectedKey.value = 'group:' + selectedGroup.value.id;
  creating.value = false;
  configDirty.value = false;
  activeTab.value = 'config';
}

async function handleInterfaceSubmit(
  payload: InterfaceSubmitPayload,
): Promise<void> {
  if (!selectedGroup.value) return;
  interfaceSaving.value = true;

  try {
    if (creating.value) {
      const created = await store.createInterface({
        ...payload,
        groupId: selectedGroup.value.id,
      });
      selectedKey.value = 'interface:' + created.id;
      creating.value = false;
      configDirty.value = false;
      editorNonce.value += 1;
      ElMessage.success('接口创建成功，默认为停用状态，请在左侧开关中启用');
      return;
    }

    const current = selectedInterface.value;
    if (!current) return;
    const result = await store.updateInterface(current.id, payload);
    configDirty.value = false;
    editorNonce.value += 1;

    if (result.needsRestart) {
      await promptRestart(result.message);
    } else {
      ElMessage.success(result.message);
    }
  } catch (error) {
    showError(error);
  } finally {
    interfaceSaving.value = false;
  }
}

/* ------------------------------ 概览辅助 ------------------------------ */

function itemState(item: MockInterfaceConfig): { text: string; type: StatusTag } {
  if (!selectedGroup.value?.enabled) {
    return { text: item.enabled ? '分组停用' : '已停用', type: 'info' };
  }
  if (!store.status.masterEnabled) {
    return { text: item.enabled ? '待启动' : '已停用', type: 'info' };
  }
  if (item.enabled) return { text: '监听中', type: 'success' };
  return { text: '已停用', type: 'info' };
}
</script>

<template>
  <div class="mock-page">
    <section v-if="store.loading && !store.initialized" v-loading="true" class="state-card loading-card" element-loading-text="正在加载 Mock 配置..." />

    <section v-else-if="store.initError && !store.initialized" class="state-card">
      <div class="state-inner">
        <div class="state-icon error">
          <el-icon :size="28"><RefreshRight /></el-icon>
        </div>
        <h2>Mock 配置加载失败</h2>
        <p>{{ store.initError }}</p>
        <el-button type="primary" :icon="RefreshRight" @click="retryInit">重新加载</el-button>
      </div>
    </section>

    <section v-else-if="store.groups.length === 0" class="state-card">
      <div class="state-inner onboarding">
        <div class="state-icon">
          <el-icon :size="30"><FolderAdd /></el-icon>
        </div>
        <span class="eyebrow">开始使用</span>
        <h2>先创建一个 Mock 分组</h2>
        <p>分组用于归类同一类接口。创建分组并添加接口后，打开右上角总开关即可在本机监听端口。</p>
        <div class="onboarding-steps">
          <span><b>1</b> 创建分组</span>
          <span><b>2</b> 添加接口</span>
          <span><b>3</b> 开启总开关</span>
        </div>
        <el-button type="primary" size="large" :icon="FolderAdd" @click="openCreateGroup">
          创建第一个分组
        </el-button>
      </div>
    </section>

    <div v-else class="mock-layout">
      <aside v-if="!isMobile" class="tree-column">
        <GroupTree
          :groups="store.groups"
          :selected-key="selectedKey"
          :busy-id="busyId"
          @select="handleTreeSelect"
          @add-group="openCreateGroup"
          @add-interface="openCreateInterface"
          @edit-group="handleEditGroup"
          @delete-group="handleDeleteGroup"
          @delete-interface="handleDeleteInterface"
          @toggle-interface="handleToggleInterface"
          @toggle-group="handleToggleGroup"
          @refresh="handleRefresh"
        />
      </aside>

      <section class="workspace">
        <div class="workspace-bar">
          <div class="workspace-heading">
            <el-button
              class="tree-toggle"
              :icon="Menu"
              @click="treeDrawer = true"
            >
              分组
            </el-button>
            <el-button
              v-if="showEditor"
              link
              :icon="Back"
              class="back-button"
              @click="backToGroupOverview"
            >
              概览
            </el-button>
            <div class="heading-text">
              <span class="eyebrow">{{ selectionEyebrow }}</span>
              <strong>{{ selectionTitle }}</strong>
            </div>
          </div>

          <div class="workspace-actions">
            <span
              class="runtime-pill"
              :class="{ on: store.status.masterEnabled }"
              :title="store.status.ports.length ? '监听端口：' + store.status.ports.join(', ') : '当前没有监听端口'"
            >
              <span class="runtime-dot" />
              {{ runtimeText }}
            </span>
            <el-button
              v-if="selectedGroup"
              type="primary"
              plain
              :icon="Plus"
              class="add-interface-button"
              @click="openCreateInterface(selectedGroup.id)"
            >
              新建接口
            </el-button>
            <el-button
              :icon="RefreshRight"
              :loading="store.switchingMaster"
              :disabled="!store.status.masterEnabled"
              @click="handleRestart"
            >
              重启
            </el-button>
          </div>
        </div>

        <div v-if="!store.status.masterEnabled" class="master-off-banner">
          <div>
            <strong>Mock 服务总开关已关闭</strong>
            <span>配置可以继续编辑，但不会监听任何端口。开启后按当前启用配置启动监听。</span>
          </div>
          <el-button type="primary" size="small" @click="enableMaster">开启总开关</el-button>
        </div>

        <el-tabs v-model="activeTab" class="workspace-tabs">
          <el-tab-pane name="config">
            <template #label>
              <span class="tab-label">接口配置</span>
            </template>

            <div class="config-view">
              <InterfaceEditor
                v-if="selectedGroup && showEditor"
                :key="selectedKey + ':' + (creating ? 'new' : editorItem?.id ?? '') + ':' + editorNonce"
                :group="selectedGroup"
                :item="editorItem"
                :mode="interfaceMode"
                :saving="interfaceSaving"
                :service-running="serviceRunningForEditor"
                @submit="handleInterfaceSubmit"
                @dirty-change="configDirty = $event"
              />

              <div v-else-if="selectedGroup" class="overview-scroll">
                <div class="overview">
                  <header class="overview-head">
                    <div class="overview-icon">
                      <el-icon :size="24"><FolderOpened /></el-icon>
                    </div>
                    <div class="overview-title">
                      <div class="overview-name-line">
                        <h2>{{ selectedGroup.name }}</h2>
                        <el-tag
                          size="small"
                          :type="selectedGroup.enabled ? 'success' : 'info'"
                          effect="light"
                        >
                          {{ selectedGroup.enabled ? '分组已启用' : '分组已停用' }}
                        </el-tag>
                      </div>
                      <p>
                        {{ selectedGroup.interfaces.length }} 个接口 · 创建于
                        {{ formatDateTime(selectedGroup.createdAt) }}
                      </p>
                    </div>
                    <div class="overview-actions">
                      <el-button type="primary" :icon="Plus" @click="openCreateInterface(selectedGroup.id)">
                        新建接口
                      </el-button>
                      <el-button :icon="Edit" @click="handleEditGroup(selectedGroup)">编辑</el-button>
                      <el-button type="danger" plain :icon="Delete" @click="handleDeleteGroup(selectedGroup)">
                        删除
                      </el-button>
                    </div>
                  </header>

                  <div class="metric-grid">
                    <div class="metric-card">
                      <span>接口总数</span>
                      <strong>{{ selectedGroup.interfaces.length }}</strong>
                    </div>
                    <div class="metric-card">
                      <span>已启用</span>
                      <strong>{{ groupEnabledCount }}</strong>
                    </div>
                    <div class="metric-card">
                      <span>正在监听</span>
                      <strong>{{ groupRunningCount }}</strong>
                    </div>
                    <div class="metric-card">
                      <span>监听端口</span>
                      <strong class="port-value">{{ groupPorts.length ? groupPorts.join(' / ') : '—' }}</strong>
                    </div>
                  </div>

                  <div class="interface-list">
                    <div class="list-head">
                      <div>
                        <strong>接口列表</strong>
                        <span>点击任意接口进入配置</span>
                      </div>
                      <span class="list-hint">开关状态在左侧分组树中调整</span>
                    </div>

                    <div v-if="selectedGroup.interfaces.length > 0" class="list-rows">
                      <button
                        v-for="item in selectedGroup.interfaces"
                        :key="item.id"
                        type="button"
                        class="interface-row"
                        @click="selectInterface(item)"
                      >
                        <el-tag
                          size="small"
                          effect="plain"
                          :type="methodTagType(item.httpMethod)"
                          class="method-tag"
                        >
                          {{ item.httpMethod }}
                        </el-tag>
                        <div class="row-main">
                          <strong>{{ item.name }}</strong>
                          <span class="row-path">{{ item.url }}</span>
                        </div>
                        <span class="row-port">:{{ item.port }}</span>
                        <el-tag size="small" :type="itemState(item).type" effect="plain">
                          {{ itemState(item).text }}
                        </el-tag>
                        <el-icon class="row-arrow"><ArrowRight /></el-icon>
                      </button>
                    </div>

                    <el-empty
                      v-else
                      :image-size="74"
                      description="这个分组还没有接口"
                    >
                      <el-button type="primary" :icon="Plus" @click="openCreateInterface(selectedGroup.id)">
                        创建第一个接口
                      </el-button>
                    </el-empty>
                  </div>
                </div>
              </div>

              <el-empty v-else description="请从分组树中选择一个分组或接口" />
            </div>
          </el-tab-pane>

          <el-tab-pane name="logs">
            <template #label>
              <span class="tab-label">
                请求日志
                <span v-if="logCount > 0" class="tab-count">{{ logCount > 99 ? '99+' : logCount }}</span>
              </span>
            </template>
            <div class="logs-view">
              <LogPanel />
            </div>
          </el-tab-pane>
        </el-tabs>
      </section>
    </div>

    <GroupEditor
      :model-value="groupDialogVisible"
      :mode="groupDialogMode"
      :group="groupDialogTarget"
      :loading="groupSaving"
      @update:model-value="groupDialogVisible = $event"
      @submit="submitGroup"
    />

    <el-drawer
      v-model="treeDrawer"
      title="分组与接口"
      direction="ltr"
      size="88%"
      append-to-body
    >
      <div class="drawer-tree">
        <GroupTree
          :groups="store.groups"
          :selected-key="selectedKey"
          :busy-id="busyId"
          @select="handleTreeSelect"
          @add-group="openCreateGroup"
          @add-interface="openCreateInterface"
          @edit-group="handleEditGroup"
          @delete-group="handleDeleteGroup"
          @delete-interface="handleDeleteInterface"
          @toggle-interface="handleToggleInterface"
          @toggle-group="handleToggleGroup"
          @refresh="handleRefresh"
        />
      </div>
    </el-drawer>
  </div>
</template>

<style scoped>
.mock-page {
  height: calc(100dvh - 120px);
  min-height: 560px;
}

.state-card {
  display: grid;
  height: calc(100dvh - 120px);
  min-height: 520px;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 18px;
  box-shadow: var(--shadow-soft);
  place-items: center;
}

.loading-card {
  min-height: 420px;
}

.state-inner {
  max-width: 520px;
  padding: 32px;
  text-align: center;
}

.state-inner h2 {
  margin: 14px 0 8px;
  font-size: 21px;
  color: var(--text-strong);
}

.state-inner p {
  margin: 0 0 22px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--text-muted);
}

.state-icon {
  display: grid;
  width: 62px;
  height: 62px;
  margin: 0 auto;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent));
  border-radius: 18px;
  box-shadow: 0 12px 26px rgba(79, 70, 229, 0.28);
  place-items: center;
}

.state-icon.error {
  background: linear-gradient(135deg, #ef4444, #f97316);
  box-shadow: 0 12px 26px rgba(239, 68, 68, 0.25);
}

.eyebrow {
  display: block;
  font-size: 9.5px;
  font-weight: 700;
  color: var(--brand-primary);
  text-transform: uppercase;
  letter-spacing: 0.13em;
}

.onboarding-steps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-bottom: 22px;
}

.onboarding-steps span {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 6px 10px;
  font-size: 10.5px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid var(--app-border);
  border-radius: 999px;
}

.onboarding-steps b {
  display: grid;
  width: 15px;
  height: 15px;
  color: #fff;
  font-size: 9px;
  background: var(--brand-primary);
  border-radius: 50%;
  place-items: center;
}

.mock-layout {
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
}

.tree-column {
  height: 100%;
  min-height: 0;
}

.workspace {
  display: flex;
  flex-direction: column;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 16px;
  box-shadow: var(--shadow-soft);
}

.workspace-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.workspace-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.heading-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.heading-text strong {
  overflow: hidden;
  max-width: 320px;
  font-size: 14px;
  color: var(--text-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.heading-text .eyebrow {
  overflow: hidden;
  font-size: 8.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.runtime-pill {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 5px 8px;
  font-size: 9.5px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px solid #f1f5f9;
  border-radius: 999px;
  white-space: nowrap;
}

.runtime-pill.on {
  color: #047857;
  background: #ecfdf5;
  border-color: #d1fae5;
}

.runtime-dot {
  width: 5px;
  height: 5px;
  background: #cbd5e1;
  border-radius: 50%;
}

.runtime-pill.on .runtime-dot {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.13);
}

.tree-toggle {
  display: none;
}

.back-button {
  padding-left: 0;
  padding-right: 0;
}

.master-off-banner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin: 10px 14px 0;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 10px;
}

.master-off-banner div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.master-off-banner strong {
  font-size: 11px;
  color: #92400e;
}

.master-off-banner span {
  font-size: 10px;
  color: #b45309;
}

.workspace-tabs {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
}

.workspace-tabs :deep(.el-tabs__header) {
  flex-shrink: 0;
  padding: 0 16px;
  margin: 0;
  border-bottom: 1px solid #f1f5f9;
}

.workspace-tabs :deep(.el-tabs__nav-wrap::after) {
  display: none;
}

.workspace-tabs :deep(.el-tabs__item) {
  height: 40px;
  font-size: 12px;
}

.workspace-tabs :deep(.el-tabs__content) {
  flex: 1;
  min-height: 0;
}

.workspace-tabs :deep(.el-tab-pane) {
  height: 100%;
}

.tab-label {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.tab-count {
  display: grid;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 8.5px;
  color: #fff;
  background: #94a3b8;
  border-radius: 999px;
  place-items: center;
}

.config-view {
  height: 100%;
  min-height: 0;
}

.config-view :deep(.editor-panel) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.overview-scroll {
  height: 100%;
  padding: 18px;
  overflow: auto;
}

.overview {
  max-width: 980px;
  margin: 0 auto;
}

.overview-head {
  display: flex;
  flex-wrap: wrap;
  gap: 13px;
  align-items: flex-start;
}

.overview-icon {
  display: grid;
  flex-shrink: 0;
  width: 50px;
  height: 50px;
  color: var(--brand-primary);
  background: #eef2ff;
  border: 1px solid #e0e7ff;
  border-radius: 14px;
  place-items: center;
}

.overview-title {
  flex: 1;
  min-width: 160px;
}

.overview-name-line {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.overview-name-line h2 {
  margin: 0;
  font-size: 18px;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.overview-title p {
  margin: 4px 0 0;
  font-size: 10.5px;
  color: #94a3b8;
}

.overview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 9px;
  margin: 18px 0;
}

.metric-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 12px 14px;
  background: linear-gradient(180deg, #fbfcff, #f8fafc);
  border: 1px solid #f1f5f9;
  border-radius: 11px;
}

.metric-card span {
  font-size: 9.5px;
  color: #94a3b8;
}

.metric-card strong {
  font-family: var(--font-mono);
  font-size: 19px;
  font-weight: 700;
  color: #334155;
  letter-spacing: -0.03em;
}

.metric-card .port-value {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-all;
}

.interface-list {
  overflow: hidden;
  border: 1px solid #f1f5f9;
  border-radius: 12px;
}

.list-head {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 14px;
  background: #fbfcfe;
  border-bottom: 1px solid #f1f5f9;
}

.list-head div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.list-head strong {
  font-size: 11.5px;
  color: #334155;
}

.list-head span {
  font-size: 9.5px;
  color: #94a3b8;
}

.list-head .list-hint {
  font-size: 9px;
}

.list-rows {
  display: flex;
  flex-direction: column;
}

.interface-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) 72px 78px auto;
  gap: 10px;
  align-items: center;
  width: 100%;
  padding: 11px 14px;
  text-align: left;
  background: #fff;
  border: 0;
  border-bottom: 1px solid #f8fafc;
  cursor: pointer;
  transition: background 0.15s ease;
}

.interface-row:last-child {
  border-bottom: 0;
}

.interface-row:hover {
  background: #f8faff;
}

.method-tag {
  min-width: 50px;
  font-family: var(--font-mono);
  font-size: 8.5px;
}

.row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.row-main strong {
  overflow: hidden;
  font-size: 11.5px;
  font-weight: 600;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-path {
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: #94a3b8;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-port {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #64748b;
}

.row-arrow {
  color: #cbd5e1;
}

.logs-view {
  height: 100%;
  min-height: 0;
  padding: 12px;
}

.logs-view :deep(.log-panel) {
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.drawer-tree :deep(.tree-panel) {
  height: calc(100dvh - 130px);
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

@media (max-width: 1100px) and (min-width: 769px) {
  .mock-layout {
    grid-template-columns: 238px minmax(0, 1fr);
  }

  .runtime-pill {
    display: none;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .mock-page {
    height: calc(100dvh - 150px);
    min-height: 520px;
  }

  .state-card {
    height: calc(100dvh - 150px);
    min-height: 480px;
  }

  .state-inner {
    padding: 22px;
  }

  .mock-layout {
    display: block;
    height: 100%;
  }

  .workspace {
    height: 100%;
    border-radius: 14px;
  }

  .workspace-bar {
    gap: 8px;
    align-items: center;
    padding: 9px 11px;
  }

  .tree-toggle {
    display: inline-flex;
  }

  .heading-text strong {
    max-width: 42vw;
    font-size: 12.5px;
  }

  .heading-text .eyebrow {
    display: none;
  }

  .back-button :deep(span) {
    display: none;
  }

  .workspace-actions {
    gap: 6px;
  }

  .runtime-pill {
    padding: 4px 7px;
    font-size: 8.5px;
  }

  .runtime-pill .runtime-dot {
    width: 4px;
    height: 4px;
  }

  .add-interface-button :deep(span) {
    display: none;
  }

  .master-off-banner {
    margin: 8px 10px 0;
    padding: 9px 10px;
  }

  .master-off-banner span {
    display: none;
  }

  .workspace-tabs :deep(.el-tabs__header) {
    padding: 0 10px;
  }

  .workspace-tabs :deep(.el-tabs__item) {
    height: 38px;
    font-size: 11.5px;
  }

  .config-view :deep(.editor-head) {
    padding: 12px 13px 8px;
  }

  .overview-scroll {
    padding: 12px;
  }

  .overview-head {
    gap: 9px;
  }

  .overview-icon {
    width: 42px;
    height: 42px;
    border-radius: 12px;
  }

  .overview-name-line h2 {
    font-size: 16px;
  }

  .overview-actions {
    width: 100%;
  }

  .overview-actions .el-button {
    flex: 1;
  }

  .metric-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin: 14px 0;
  }

  .metric-card {
    padding: 10px 11px;
  }

  .metric-card strong {
    font-size: 17px;
  }

  .list-head {
    padding: 9px 11px;
  }

  .list-head .list-hint {
    display: none;
  }

  .interface-row {
    grid-template-columns: auto minmax(0, 1fr) auto;
    gap: 8px;
    padding: 10px 11px;
  }

  .row-port,
  .interface-row > .el-tag:last-of-type {
    display: none;
  }

  .row-arrow {
    display: none;
  }

  .logs-view {
    padding: 8px;
  }
}

@media (max-width: 420px) {
  .runtime-pill {
    display: none;
  }

  .overview-actions .el-button {
    padding-right: 9px;
    padding-left: 9px;
  }
}
</style>
