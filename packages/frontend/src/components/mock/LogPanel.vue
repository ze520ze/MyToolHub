<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMediaQuery } from '@vueuse/core';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  Delete,
  DocumentCopy,
  Refresh,
  Search,
} from '@element-plus/icons-vue';
import type { RequestLog } from '@mytoolhub/shared';
import { useMockStore } from '@/stores/mock.store';
import { copyText } from '@/utils/clipboard';
import {
  formatClock,
  formatDateTime,
  formatFullTime,
  httpStatusTagType,
  logToJson,
  methodTagType,
  methodList,
  shortUserAgent,
} from '@/utils/format';

const store = useMockStore();
const isMobile = useMediaQuery('(max-width: 768px)');

const keyword = ref('');
const methodFilter = ref('');
const statusFilter = ref<'all' | 'success' | 'error'>('all');
const refreshing = ref(false);
const drawerVisible = ref(false);
const activeLog = ref<RequestLog | null>(null);

const filteredLogs = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  return store.logs.filter((log) => {
    if (methodFilter.value && log.method !== methodFilter.value) return false;
    if (statusFilter.value === 'success' && log.statusCode >= 400) return false;
    if (statusFilter.value === 'error' && log.statusCode < 400) return false;
    if (!text) return true;
    return [log.url, log.interfaceName, log.groupName, log.ip]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(text));
  });
});

const successCount = computed(
  () => store.logs.filter((log) => log.statusCode < 400).length,
);
const errorCount = computed(
  () => store.logs.filter((log) => log.statusCode >= 400).length,
);
const notFoundCount = computed(
  () => store.logs.filter((log) => log.statusCode === 404).length,
);

function openDetail(log: RequestLog): void {
  activeLog.value = log;
  drawerVisible.value = true;
}

async function handleRefresh(): Promise<void> {
  refreshing.value = true;
  try {
    await store.fetchLogs();
    ElMessage.success('日志已刷新');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '刷新失败');
  } finally {
    refreshing.value = false;
  }
}

async function handleClear(): Promise<void> {
  if (store.logs.length === 0) return;
  try {
    await ElMessageBox.confirm(
      '清空后仅影响当前内存中的日志，是否继续？',
      '清空日志',
      {
        confirmButtonText: '清空',
        cancelButtonText: '取消',
        type: 'warning',
      },
    );
  } catch {
    return;
  }
  store.clearLogs();
  ElMessage.success('日志已清空');
}

async function copyTextWithTip(text: string, tip: string): Promise<void> {
  try {
    await copyText(text);
    ElMessage.success(tip);
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复制失败');
  }
}

function copyFullLog(): void {
  if (!activeLog.value) return;
  void copyTextWithTip(logToJson(activeLog.value), '完整日志已复制');
}

function copyResponse(): void {
  if (!activeLog.value) return;
  void copyTextWithTip(activeLog.value.responsePreview, '响应内容已复制');
}
</script>

<template>
  <section class="log-panel">
    <header class="log-head">
      <div class="log-title">
        <h2>请求日志</h2>
        <span class="live-badge" :class="{ online: store.realtimeConnected }">
          <span class="live-dot" />
          {{ store.realtimeConnected ? '实时接收中' : '实时连接未建立' }}
        </span>
      </div>
      <div class="log-stats">
        <span><strong>{{ store.logs.length }}</strong> 总数</span>
        <span class="ok"><strong>{{ successCount }}</strong> 成功</span>
        <span class="err"><strong>{{ errorCount }}</strong> 异常</span>
        <span v-if="notFoundCount > 0" class="warn"><strong>{{ notFoundCount }}</strong> 404</span>
      </div>
      <div class="log-tools">
        <el-tooltip content="刷新日志" placement="top">
          <el-button circle size="small" :icon="Refresh" :loading="refreshing" @click="handleRefresh" />
        </el-tooltip>
        <el-tooltip content="清空日志" placement="top">
          <el-button
            circle
            size="small"
            :icon="Delete"
            :disabled="store.logs.length === 0"
            @click="handleClear"
          />
        </el-tooltip>
      </div>
    </header>

    <div class="log-filters">
      <el-input
        v-model="keyword"
        class="search-input"
        placeholder="搜索路径、接口、分组、IP"
        clearable
        :prefix-icon="Search"
      />
      <el-select v-model="methodFilter" class="filter-select" placeholder="方法">
        <el-option label="全部方法" value="" />
        <el-option v-for="method in methodList()" :key="method" :label="method" :value="method" />
      </el-select>
      <el-select v-model="statusFilter" class="filter-select" placeholder="状态">
        <el-option label="全部状态" value="all" />
        <el-option label="成功 (<400)" value="success" />
        <el-option label="异常 (>=400)" value="error" />
      </el-select>
    </div>

    <div class="log-body">
      <template v-if="!isMobile">
        <el-table
          :data="filteredLogs"
          height="100%"
          size="small"
          class="log-table"
          @row-click="openDetail"
        >
          <el-table-column label="时间" width="88">
            <template #default="{ row }">
              <span class="time-cell" :title="formatFullTime(row.timestamp)">
                {{ formatClock(row.timestamp) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column label="方法" width="74">
            <template #default="{ row }">
              <el-tag size="small" effect="plain" :type="methodTagType(row.method)">
                {{ row.method }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="请求路径" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="url-cell">{{ row.url }}</span>
            </template>
          </el-table-column>
          <el-table-column label="匹配接口" min-width="130" show-overflow-tooltip>
            <template #default="{ row }">
              <div v-if="row.interfaceName" class="interface-cell">
                <span>{{ row.groupName }}</span>
                <strong>{{ row.interfaceName }}</strong>
              </div>
              <span v-else class="not-found">未匹配</span>
            </template>
          </el-table-column>
          <el-table-column label="状态" width="76" align="center">
            <template #default="{ row }">
              <el-tag size="small" :type="httpStatusTagType(row.statusCode)">
                {{ row.statusCode }}
              </el-tag>
            </template>
          </el-table-column>
          <el-table-column label="耗时" width="72" align="right">
            <template #default="{ row }">
              <span class="duration">{{ row.durationMs }} ms</span>
            </template>
          </el-table-column>
          <el-table-column label="来源 IP" width="112" show-overflow-tooltip>
            <template #default="{ row }">
              <span class="ip-cell">{{ row.ip || '-' }}</span>
            </template>
          </el-table-column>
        </el-table>
      </template>

      <div v-else class="mobile-log-list">
        <button
          v-for="log in filteredLogs"
          :key="log.id"
          type="button"
          class="mobile-log"
          :class="{ failed: log.statusCode >= 400 }"
          @click="openDetail(log)"
        >
          <div class="mobile-log-top">
            <el-tag size="small" effect="plain" :type="methodTagType(log.method)">
              {{ log.method }}
            </el-tag>
            <span class="mobile-url">{{ log.url }}</span>
            <el-tag size="small" :type="httpStatusTagType(log.statusCode)">
              {{ log.statusCode }}
            </el-tag>
          </div>
          <div class="mobile-log-meta">
            <span>{{ formatDateTime(log.timestamp) }}</span>
            <span>{{ log.durationMs }} ms</span>
            <span class="ellipsis">{{ log.interfaceName || '未匹配接口' }}</span>
          </div>
        </button>
      </div>

      <el-empty
        v-if="filteredLogs.length === 0"
        class="log-empty"
        :image-size="76"
        :description="store.logs.length === 0 ? '还没有请求，访问 Mock 地址后这里会实时出现记录' : '没有匹配当前筛选条件的日志'"
      />
    </div>

    <el-drawer
      v-model="drawerVisible"
      title="请求详情"
      :size="isMobile ? '100%' : '560px'"
      append-to-body
    >
      <template v-if="activeLog">
        <div class="detail-actions">
          <el-button :icon="DocumentCopy" @click="copyFullLog">复制完整日志</el-button>
          <el-button :icon="DocumentCopy" @click="copyResponse">复制响应内容</el-button>
        </div>

        <el-descriptions :column="isMobile ? 1 : 2" border size="small">
          <el-descriptions-item label="时间" :span="2">
            {{ formatFullTime(activeLog.timestamp) }}
          </el-descriptions-item>
          <el-descriptions-item label="方法">
            <el-tag size="small" :type="methodTagType(activeLog.method)">
              {{ activeLog.method }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="状态码">
            <el-tag size="small" :type="httpStatusTagType(activeLog.statusCode)">
              {{ activeLog.statusCode }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="请求地址" :span="2">
            <code class="detail-code">{{ activeLog.url }}</code>
          </el-descriptions-item>
          <el-descriptions-item label="匹配分组">
            {{ activeLog.groupName || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="匹配接口">
            {{ activeLog.interfaceName || '未匹配' }}
          </el-descriptions-item>
          <el-descriptions-item label="耗时">
            {{ activeLog.durationMs }} ms
          </el-descriptions-item>
          <el-descriptions-item label="来源 IP">
            {{ activeLog.ip || '-' }}
          </el-descriptions-item>
          <el-descriptions-item label="User-Agent" :span="2">
            <span :title="activeLog.userAgent">{{ shortUserAgent(activeLog.userAgent) }}</span>
          </el-descriptions-item>
          <el-descriptions-item label="日志 ID" :span="2">
            <code class="detail-code">{{ activeLog.id }}</code>
          </el-descriptions-item>
        </el-descriptions>

        <div class="detail-section">
          <div class="detail-section-head">
            <span>响应内容</span>
            <span class="muted">最多保留前 2000 个字符</span>
          </div>
          <el-input
            :model-value="activeLog.responsePreview"
            type="textarea"
            readonly
            :rows="14"
            class="detail-response"
          />
        </div>
      </template>
    </el-drawer>
  </section>
</template>

<style scoped>
.log-panel {
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

.log-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px 16px;
  align-items: center;
  justify-content: space-between;
  padding: 15px 17px 10px;
}

.log-title {
  display: flex;
  gap: 10px;
  align-items: center;
}

.log-title h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.live-badge {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  padding: 3px 7px;
  font-size: 9px;
  color: #94a3b8;
  background: #f8fafc;
  border-radius: 999px;
}

.live-dot {
  width: 5px;
  height: 5px;
  background: #cbd5e1;
  border-radius: 50%;
}

.live-badge.online {
  color: #047857;
  background: #ecfdf5;
}

.live-badge.online .live-dot {
  background: #10b981;
  box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.14);
}

.log-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 9.5px;
  color: #94a3b8;
}

.log-stats strong {
  margin-right: 2px;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #334155;
}

.log-stats .ok strong {
  color: #059669;
}

.log-stats .err strong {
  color: #dc2626;
}

.log-stats .warn strong {
  color: #d97706;
}

.log-tools {
  display: flex;
  gap: 5px;
}

.log-filters {
  display: flex;
  gap: 7px;
  padding: 0 17px 10px;
  border-bottom: 1px solid #f1f5f9;
}

.search-input {
  flex: 1;
  min-width: 150px;
}

.filter-select {
  width: 118px;
}

.log-body {
  position: relative;
  flex: 1;
  min-height: 0;
}

.log-table {
  --el-table-border-color: #f1f5f9;
  --el-table-header-bg-color: #fafbfc;
  --el-table-row-hover-bg-color: #f8faff;
}

.log-table :deep(.el-table__row) {
  cursor: pointer;
}

.time-cell,
.duration,
.ip-cell {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #64748b;
}

.url-cell {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #334155;
  word-break: break-all;
}

.interface-cell {
  display: flex;
  flex-direction: column;
  gap: 1px;
  line-height: 1.35;
}

.interface-cell span {
  font-size: 9px;
  color: #94a3b8;
}

.interface-cell strong {
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 600;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.not-found {
  font-size: 10px;
  color: #d97706;
}

.mobile-log-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px;
  overflow: auto;
  height: 100%;
}

.mobile-log {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  padding: 10px;
  text-align: left;
  background: #fff;
  border: 1px solid #f1f5f9;
  border-radius: 10px;
}

.mobile-log.failed {
  background: #fffafa;
  border-color: #fee2e2;
}

.mobile-log-top {
  display: flex;
  gap: 7px;
  align-items: center;
}

.mobile-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #334155;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mobile-log-meta {
  display: flex;
  gap: 10px;
  font-size: 9px;
  color: #94a3b8;
}

.mobile-log-meta .ellipsis {
  margin-left: auto;
  overflow: hidden;
  max-width: 45%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.log-empty {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.9);
}

.detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.detail-code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #475569;
  word-break: break-all;
}

.detail-section {
  margin-top: 18px;
}

.detail-section-head {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 7px;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.detail-section-head .muted {
  font-size: 9px;
  font-weight: 400;
  color: #94a3b8;
}

.detail-response :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.65;
  background: #fbfcfe;
}

@media (max-width: 768px) {
  .log-head {
    padding: 12px 12px 8px;
  }

  .log-stats {
    gap: 8px;
  }

  .log-filters {
    flex-wrap: wrap;
    padding: 0 12px 9px;
  }

  .search-input {
    flex-basis: 100%;
  }

  .filter-select {
    flex: 1;
    width: auto;
  }

  .log-body {
    min-height: 55vh;
  }
}
</style>
