<script setup lang="ts">
import { nextTick, reactive, ref, watch } from 'vue';
import type { FormInstance, FormRules } from 'element-plus';
import type { MockGroupWithInterfaces } from '@mytoolhub/shared';

const props = defineProps<{
  modelValue: boolean;
  mode: 'create' | 'edit';
  group?: MockGroupWithInterfaces | null;
  loading?: boolean;
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void;
  (event: 'submit', payload: { name: string; enabled: boolean }): void;
}>();

const formRef = ref<FormInstance>();
const form = reactive({
  name: '',
  enabled: true,
});

const rules: FormRules = {
  name: [
    {
      validator: (_rule, value: string, callback) => {
        const name = String(value ?? '').trim();
        if (!name) {
          callback(new Error('请输入分组名称'));
        } else if (name.length > 50) {
          callback(new Error('分组名称不能超过 50 个字符'));
        } else {
          callback();
        }
      },
      trigger: 'blur',
    },
  ],
};

watch(
  () => props.modelValue,
  async (visible) => {
    if (!visible) return;
    form.name = props.mode === 'edit' ? props.group?.name ?? '' : '';
    form.enabled = props.mode === 'edit' ? props.group?.enabled ?? true : true;
    await nextTick();
    formRef.value?.clearValidate();
  },
  { immediate: true },
);

async function handleSubmit(): Promise<void> {
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid) return;
  emit('submit', {
    name: form.name.trim(),
    enabled: form.enabled,
  });
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="mode === 'edit' ? '编辑分组' : '新建分组'"
    width="min(440px, calc(100vw - 24px))"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="(value: boolean) => emit('update:modelValue', value)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="handleSubmit"
    >
      <el-form-item label="分组名称" prop="name">
        <el-input
          v-model="form.name"
          maxlength="50"
          show-word-limit
          placeholder="例如：设备联调"
          @keyup.enter="handleSubmit"
        />
        <div class="form-hint">分组名称全局唯一，不区分大小写</div>
      </el-form-item>

      <el-form-item label="启用分组">
        <div class="switch-line">
          <el-switch v-model="form.enabled" />
          <span>停用的分组不会被 Mock 服务启动</span>
        </div>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">取消</el-button>
      <el-button type="primary" :loading="loading" @click="handleSubmit">
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.form-hint {
  margin-top: 5px;
  font-size: 10.5px;
  line-height: 1.5;
  color: #94a3b8;
}

.switch-line {
  display: flex;
  gap: 9px;
  align-items: center;
}

.switch-line span {
  font-size: 11px;
  color: #64748b;
}
</style>
