<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import type { FormInstance, FormRules } from 'element-plus';
import {
  CopyDocument,
  MagicStick,
  RefreshLeft,
  Select,
} from '@element-plus/icons-vue';
import {
  MOCK_INTERFACE_TYPES,
  type MockHttpMethod,
  type MockInterfaceConfig,
  type MockInterfaceType,
  type MockGroupWithInterfaces,
} from '@mytoolhub/shared';
import { copyText } from '@/utils/clipboard';
import {
  buildMockUrl,
  defaultResponseData,
  isJsonText,
  methodList,
  prettyJson,
} from '@/utils/format';

interface InterfaceForm {
  name: string;
  type: MockInterfaceType;
  ipAddress: string;
  port: number;
  url: string;
  httpMethod: MockHttpMethod;
  responseData: string;
}

interface InterfaceEditorPayload {
  name: string;
  type: MockInterfaceType;
  ipAddress: string;
  port: number;
  url: string;
  httpMethod: MockHttpMethod;
  responseData: string;
}

const props = defineProps<{
  group: MockGroupWithInterfaces;
  item?: MockInterfaceConfig | null;
  mode: 'create' | 'edit';
  saving?: boolean;
  serviceRunning?: boolean;
}>();

const emit = defineEmits<{
  (event: 'submit', payload: InterfaceEditorPayload): void;
  (event: 'dirty-change', value: boolean): void;
}>();

const formRef = ref<FormInstance>();
const baseline = ref('');
const form = reactive<InterfaceForm>({
  name: '',
  type: 'WebApi',
  ipAddress: '',
  port: 8080,
  url: '/api/test',
  httpMethod: 'GET',
  responseData: defaultResponseData(),
});

const rules: FormRules = {
  name: [
    {
      validator: (_rule, value: string, callback) => {
        const name = String(value ?? '').trim();
        if (!name) {
          callback(new Error('请输入接口名称'));
        } else if (name.length > 50) {
          callback(new Error('接口名称不能超过 50 个字符'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
  url: [
    {
      validator: (_rule, value: string, callback) => {
        const url = String(value ?? '').trim();
        if (!url) {
          callback(new Error('请输入接口路径'));
        } else if (!url.startsWith('/')) {
          callback(new Error('接口路径必须以 / 开头'));
        } else if (/\s/.test(url)) {
          callback(new Error('接口路径不能包含空格'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
  port: [
    {
      validator: (_rule, value: number, callback) => {
        if (!Number.isInteger(value) || value < 1 || value > 65535) {
          callback(new Error('端口必须是 1-65535 的整数'));
        } else {
          callback();
        }
      },
      trigger: 'change',
    },
  ],
};

const dirty = computed(() => JSON.stringify(form) !== baseline.value);
const jsonValid = computed(() => isJsonText(form.responseData));
const targetUrl = computed(() =>
  buildMockUrl(form.ipAddress, Number(form.port) || 0, form.url || '/'),
);
const isEditing = computed(() => props.mode === 'edit');

watch(dirty, (value) => emit('dirty-change', value), { immediate: true });

const formKey = computed(
  () =>
    props.mode +
    ':' +
    props.group.id +
    ':' +
    (props.item?.id ?? 'new') +
    ':' +
    (props.item?.updatedAt ?? ''),
);

watch(
  formKey,
  async () => {
    resetForm();
    await nextTick();
    formRef.value?.clearValidate();
  },
  { immediate: true },
);

function resetForm(): void {
  if (props.item) {
    form.name = props.item.name;
    form.type = props.item.type;
    form.ipAddress = props.item.ipAddress;
    form.port = props.item.port;
    form.url = props.item.url;
    form.httpMethod = props.item.httpMethod;
    form.responseData = props.item.responseData;
  } else {
    form.name = '';
    form.type = 'WebApi';
    form.ipAddress = '';
    form.port = 8080;
    form.url = '/api/test';
    form.httpMethod = 'GET';
    form.responseData = defaultResponseData();
  }
  baseline.value = JSON.stringify(form);
}

async function handleReset(): Promise<void> {
  if (dirty.value) {
    try {
      await ElMessageBox.confirm('确定放弃当前未保存的修改吗？', '重置表单', {
        confirmButtonText: '放弃修改',
        cancelButtonText: '继续编辑',
        type: 'warning',
      });
    } catch {
      return;
    }
  }
  resetForm();
  formRef.value?.clearValidate();
}

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;

  emit('submit', {
    name: form.name.trim(),
    type: form.type,
    ipAddress: form.ipAddress.trim(),
    port: Number(form.port),
    url: form.url.trim(),
    httpMethod: form.httpMethod,
    responseData: form.responseData,
  });
}

function formatResponse(): void {
  const pretty = prettyJson(form.responseData);
  if (pretty === null) {
    ElMessage.warning('当前响应数据不是合法 JSON，无法格式化');
    return;
  }
  form.responseData = pretty;
}

async function restoreSample(): Promise<void> {
  if (form.responseData.trim() && form.responseData !== defaultResponseData()) {
    try {
      await ElMessageBox.confirm('将用示例 JSON 覆盖当前响应数据，是否继续？', '恢复示例', {
        confirmButtonText: '覆盖',
        cancelButtonText: '取消',
        type: 'warning',
      });
    } catch {
      return;
    }
  }
  form.responseData = defaultResponseData();
}

async function copyUrl(): Promise<void> {
  try {
    await copyText(targetUrl.value);
    ElMessage.success('地址已复制');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复制失败');
  }
}

async function copyResponse(): Promise<void> {
  try {
    await copyText(form.responseData);
    ElMessage.success('响应数据已复制');
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : '复制失败');
  }
}
</script>

<template>
  <section class="editor-panel">
    <header class="editor-head">
      <div class="heading">
        <div class="breadcrumb">
          <span>{{ group.name }}</span>
          <span class="sep">/</span>
          <strong>{{ isEditing ? item?.name : '新建接口' }}</strong>
        </div>
        <h2>{{ isEditing ? '接口配置' : '新建 Mock 接口' }}</h2>
      </div>
      <el-tag v-if="isEditing" :type="item?.enabled ? 'success' : 'info'" effect="light">
        {{ item?.enabled ? '已启用' : '已停用' }}
      </el-tag>
      <el-tag v-else type="warning" effect="light">未保存</el-tag>
    </header>

    <div class="editor-scroll">
      <el-alert
        v-if="!group.enabled"
        type="warning"
        :closable="false"
        show-icon
        title="所属分组已停用"
        description="保存后接口会保留配置，但不会随 Mock 服务启动；请先启用分组。"
        class="editor-alert"
      />
      <el-alert
        v-else-if="isEditing && item?.enabled && serviceRunning"
        type="info"
        :closable="false"
        show-icon
        title="该接口正在监听"
        description="修改端口、路径或响应内容后保存，需要重启 Mock 服务才会生效。"
        class="editor-alert"
      />

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        class="interface-form"
        @submit.prevent="handleSubmit"
      >
        <div class="form-grid">
          <el-form-item label="接口名称" prop="name" class="span-2">
            <el-input
              v-model="form.name"
              maxlength="50"
              show-word-limit
              placeholder="例如：查询设备状态"
            />
          </el-form-item>

          <el-form-item label="协议类型">
            <el-select v-model="form.type" class="full-width">
              <el-option
                v-for="type in MOCK_INTERFACE_TYPES"
                :key="type"
                :label="type"
                :value="type"
              />
            </el-select>
            <div class="field-hint">当前版本统一按 HTTP 监听</div>
          </el-form-item>

          <el-form-item label="监听 IP">
            <el-input v-model="form.ipAddress" placeholder="留空表示 0.0.0.0" />
            <div class="field-hint">留空监听所有网卡，手机可通过电脑 IP 访问</div>
          </el-form-item>

          <el-form-item label="端口" prop="port">
            <el-input-number
              v-model="form.port"
              class="full-width"
              :min="1"
              :max="65535"
              :step="1"
              step-strictly
              controls-position="right"
            />
          </el-form-item>

          <el-form-item label="HTTP 方法">
            <el-select v-model="form.httpMethod" class="full-width">
              <el-option
                v-for="method in methodList()"
                :key="method"
                :label="method"
                :value="method"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="接口路径" prop="url" class="span-2">
            <el-input v-model="form.url" placeholder="/api/test">
              <template #prepend>URL</template>
            </el-input>
            <div class="field-hint">匹配时忽略大小写与末尾斜杠，例如 /api/Test/ 等同 /api/test</div>
          </el-form-item>
        </div>

        <div class="response-section">
          <div class="section-label">
            <div>
              <span>响应数据</span>
              <el-tag v-if="jsonValid" size="small" type="success" effect="plain">合法 JSON</el-tag>
              <el-tag v-else size="small" type="info" effect="plain">纯文本</el-tag>
            </div>
            <div class="response-tools">
              <el-button link :icon="MagicStick" @click="formatResponse">格式化 JSON</el-button>
              <el-button link :icon="RefreshLeft" @click="restoreSample">恢复示例</el-button>
              <el-button link :icon="CopyDocument" @click="copyResponse">复制</el-button>
            </div>
          </div>

          <el-input
            v-model="form.responseData"
            type="textarea"
            :rows="13"
            resize="vertical"
            class="response-input"
            placeholder="支持多行文本。合法 JSON 会在返回前自动压缩；其他内容原样返回。"
          />
          <div class="response-meta">
            <span>{{ form.responseData.length }} 个字符</span>
            <span>返回 Content-Type：{{ jsonValid ? 'application/json' : 'text/plain' }}</span>
          </div>
        </div>

        <div class="endpoint-preview">
          <div class="endpoint-label">
            <el-icon><Select /></el-icon>
            保存后可访问地址
          </div>
          <div class="endpoint-line">
            <code>{{ form.httpMethod }} {{ targetUrl }}</code>
            <el-button link :icon="CopyDocument" @click="copyUrl">复制</el-button>
          </div>
          <p>实际监听地址取决于绑定 IP；留空时本机使用 localhost，局域网设备使用电脑 IP。</p>
        </div>
      </el-form>
    </div>

    <footer class="editor-foot">
      <span class="dirty-tip" :class="{ active: dirty }">
        {{ dirty ? '有未保存的修改' : '配置已同步' }}
      </span>
      <div class="foot-actions">
        <el-button :icon="RefreshLeft" @click="handleReset">重置</el-button>
        <el-button type="primary" :loading="saving" @click="handleSubmit">
          {{ isEditing ? '保存配置' : '创建接口' }}
        </el-button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.editor-panel {
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

.editor-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 17px 20px 13px;
  border-bottom: 1px solid #f1f5f9;
}

.breadcrumb {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-bottom: 3px;
  font-size: 10.5px;
  color: #94a3b8;
}

.breadcrumb strong {
  max-width: 260px;
  overflow: hidden;
  font-weight: 600;
  color: #64748b;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sep {
  color: #cbd5e1;
}

.editor-head h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-strong);
}

.editor-scroll {
  flex: 1;
  min-height: 0;
  padding: 14px 20px 16px;
  overflow: auto;
}

.editor-alert {
  margin-bottom: 14px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.span-2 {
  grid-column: span 2;
}

.interface-form :deep(.el-form-item) {
  margin-bottom: 14px;
}

.interface-form :deep(.el-form-item__label) {
  padding-bottom: 4px;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.full-width {
  width: 100%;
}

.field-hint {
  margin-top: 4px;
  font-size: 9.5px;
  line-height: 1.5;
  color: #94a3b8;
}

.response-section {
  padding-top: 3px;
}

.section-label {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.section-label > div:first-child {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: #475569;
}

.response-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.response-tools :deep(.el-button) {
  font-size: 10.5px;
}

.response-input :deep(.el-textarea__inner) {
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.7;
  background: #fbfcfe;
}

.response-meta {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-top: 5px;
  font-size: 9.5px;
  color: #94a3b8;
}

.endpoint-preview {
  margin-top: 15px;
  padding: 12px 14px;
  background: #f8fafc;
  border: 1px dashed #dbe3ef;
  border-radius: 10px;
}

.endpoint-label {
  display: flex;
  gap: 5px;
  align-items: center;
  font-size: 10px;
  font-weight: 600;
  color: #64748b;
}

.endpoint-line {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}

.endpoint-line code {
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--brand-primary);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.endpoint-preview p {
  margin: 6px 0 0;
  font-size: 9.5px;
  line-height: 1.5;
  color: #94a3b8;
}

.editor-foot {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 11px 20px;
  background: rgba(255, 255, 255, 0.96);
  border-top: 1px solid #f1f5f9;
}

.dirty-tip {
  font-size: 10px;
  color: #94a3b8;
}

.dirty-tip.active {
  color: #d97706;
}

.dirty-tip.active::before {
  display: inline-block;
  width: 5px;
  height: 5px;
  margin-right: 5px;
  vertical-align: 1px;
  content: '';
  background: #f59e0b;
  border-radius: 50%;
}

.foot-actions {
  display: flex;
  gap: 8px;
}

@media (max-width: 768px) {
  .editor-head {
    padding: 14px 14px 10px;
  }

  .editor-scroll {
    padding: 12px 14px;
  }

  .form-grid {
    grid-template-columns: 1fr;
  }

  .span-2 {
    grid-column: auto;
  }

  .editor-foot {
    padding: 9px 12px;
  }

  .dirty-tip {
    display: none;
  }

  .foot-actions {
    width: 100%;
  }

  .foot-actions :deep(.el-button) {
    flex: 1;
  }
}
</style>
