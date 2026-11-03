<script setup lang="ts">
import { computed, type Component } from 'vue';
import MockMasterSwitch from '@/components/mock/MockMasterSwitch.vue';

const props = defineProps<{
  action?: string;
}>();

/**
 * 顶栏动作注册表。
 * 新模块只要在路由 meta.headerAction 中声明名字，再在这里登记组件即可，
 * App.vue 始终不需要知道具体业务。
 */
const registry: Record<string, Component> = {
  'mock-master': MockMasterSwitch,
};

const resolved = computed<Component | undefined>(() =>
  props.action ? registry[props.action] : undefined,
);
</script>

<template>
  <component :is="resolved" v-if="resolved" />
</template>
