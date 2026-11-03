<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { getErrorMessage } from '@/api/http';
import { useMockStore } from '@/stores/mock.store';

const store = useMockStore();
const localEnabled = ref(store.status.masterEnabled);

watch(
  () => store.status.masterEnabled,
  (value) => {
    localEnabled.value = value;
  },
);

onMounted(() => {
  // 顶栏可能先于 Mock 页面挂载，这里主动拉取真实状态
  store.initialize().catch(() => undefined);
});

async function handleChange(value: string | number | boolean): Promise<void> {
  const enabled = Boolean(value);
  localEnabled.value = enabled;
  try {
    const result = await store.setMaster(enabled);
    ElMessage.success(result.message);
  } catch (error) {
    localEnabled.value = store.status.masterEnabled;
    ElMessage.error(getErrorMessage(error));
  }
}
</script>

<template>
  <div class="master-switch">
    <span class="master-label">Mock 服务</span>
    <el-switch
      :model-value="localEnabled"
      :loading="store.switchingMaster"
      inline-prompt
      active-text="开"
      inactive-text="关"
      @change="handleChange"
    />
  </div>
</template>

<style scoped>
.master-switch {
  display: flex;
  gap: 9px;
  align-items: center;
  padding: 5px 10px;
  background: #f8fafc;
  border: 1px solid var(--app-border);
  border-radius: 999px;
}

.master-label {
  font-size: 12px;
  font-weight: 600;
  color: #475569;
}

@media (max-width: 768px) {
  .master-switch {
    padding: 4px 7px;
    border-radius: 9px;
  }

  .master-label {
    display: none;
  }
}
</style>
