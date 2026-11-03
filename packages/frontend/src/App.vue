<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useMediaQuery } from '@vueuse/core';
import { Grid } from '@element-plus/icons-vue';
import { navigationItems } from '@/router';
import HeaderActionHost from '@/layouts/HeaderActionHost.vue';

const route = useRoute();
const router = useRouter();
const isMobile = useMediaQuery('(max-width: 768px)');

const currentTitle = computed(() => route.meta.title ?? 'MyToolHub');
const currentDescription = computed(() => route.meta.description ?? '');
const activePath = computed(() => route.path);

function navigate(path: string): void {
  if (route.path !== path) {
    void router.push(path);
  }
}
</script>

<template>
  <div class="app-shell">
    <aside v-if="!isMobile" class="app-sidebar">
      <div class="brand">
        <div class="brand-mark">
          <el-icon :size="22"><Grid /></el-icon>
        </div>
        <div class="brand-text">
          <strong>MyToolHub</strong>
          <span>个人工具集</span>
        </div>
      </div>

      <nav class="sidebar-nav" aria-label="主导航">
        <button
          v-for="item in navigationItems"
          :key="item.path"
          type="button"
          class="nav-item"
          :class="{ active: activePath === item.path }"
          @click="navigate(item.path)"
        >
          <el-icon :size="18"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
          <span v-if="activePath === item.path" class="nav-indicator" />
        </button>
      </nav>

      <div class="sidebar-footer">
        <span class="status-dot" />
        <div>
          <strong>本地运行</strong>
          <span>单机 · 可局域网访问</span>
        </div>
      </div>
    </aside>

    <div class="app-main">
      <header class="app-header">
        <div class="header-title">
          <h1>{{ currentTitle }}</h1>
          <p v-if="!isMobile && currentDescription">{{ currentDescription }}</p>
        </div>
        <div class="header-actions">
          <HeaderActionHost :action="route.meta.headerAction" />
          <span class="local-badge">
            <span class="status-dot" />
            本地服务
          </span>
        </div>
      </header>

      <main class="app-content" :class="{ 'is-mobile': isMobile }">
        <router-view v-slot="{ Component }">
          <transition name="page" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>

      <nav v-if="isMobile" class="mobile-tabbar" aria-label="底部导航">
        <button
          v-for="item in navigationItems"
          :key="item.path"
          type="button"
          class="tabbar-item"
          :class="{ active: activePath === item.path }"
          @click="navigate(item.path)"
        >
          <el-icon :size="20"><component :is="item.icon" /></el-icon>
          <span>{{ item.title }}</span>
        </button>
      </nav>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100dvh;
  background: var(--app-bg);
}

.app-sidebar {
  position: fixed;
  inset: 0 auto 0 0;
  z-index: 30;
  display: flex;
  flex-direction: column;
  width: 236px;
  padding: 22px 16px 18px;
  color: #e2e8f0;
  background:
    radial-gradient(circle at 10% 0%, rgba(79, 70, 229, 0.35), transparent 42%),
    var(--sidebar-bg);
  border-right: 1px solid rgba(148, 163, 184, 0.12);
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 8px 24px;
}

.brand-mark {
  display: grid;
  width: 42px;
  height: 42px;
  color: #fff;
  background: linear-gradient(135deg, var(--brand-primary), var(--brand-accent));
  border-radius: 12px;
  place-items: center;
  box-shadow: 0 8px 22px rgba(79, 70, 229, 0.35);
}

.brand-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.brand-text strong {
  font-size: 16px;
  letter-spacing: 0.02em;
}

.brand-text span {
  font-size: 11px;
  color: #94a3b8;
  letter-spacing: 0.12em;
}

.sidebar-nav {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 6px;
}

.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 12px;
  color: #94a3b8;
  font-size: 14px;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  transition: color 0.18s ease, background 0.18s ease;
}

.nav-item:hover {
  color: #f8fafc;
  background: rgba(148, 163, 184, 0.1);
}

.nav-item.active {
  color: #fff;
  background: rgba(99, 102, 241, 0.2);
}

.nav-indicator {
  width: 5px;
  height: 5px;
  margin-left: auto;
  background: #a5b4fc;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(165, 180, 252, 0.12);
}

.sidebar-footer {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 14px 10px 0;
  border-top: 1px solid rgba(148, 163, 184, 0.12);
}

.sidebar-footer div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sidebar-footer strong {
  font-size: 12px;
  font-weight: 600;
  color: #cbd5e1;
}

.sidebar-footer span:last-child {
  font-size: 10px;
  color: #64748b;
}

.app-main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  margin-left: 236px;
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  min-height: 72px;
  padding: 14px 26px;
  background: rgba(255, 255, 255, 0.82);
  border-bottom: 1px solid var(--app-border);
  backdrop-filter: blur(14px);
}

.header-title h1 {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.header-title p {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  gap: 14px;
  align-items: center;
}

.local-badge {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 5px 9px;
  font-size: 11px;
  color: #475569;
  background: #f8fafc;
  border: 1px solid var(--app-border);
  border-radius: 999px;
}

.app-content {
  flex: 1;
  padding: 22px 26px 26px;
}

.app-content.is-mobile {
  padding: 14px 12px 78px;
}

.mobile-tabbar {
  position: fixed;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 30;
  display: flex;
  justify-content: space-around;
  padding: 6px 8px calc(6px + env(safe-area-inset-bottom));
  background: rgba(255, 255, 255, 0.94);
  border-top: 1px solid var(--app-border);
  backdrop-filter: blur(14px);
}

.tabbar-item {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  align-items: center;
  padding: 5px 0;
  color: #94a3b8;
  font-size: 10px;
  background: none;
  border: 0;
}

.tabbar-item.active {
  color: var(--brand-primary);
}

.page-enter-active,
.page-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.page-enter-from {
  opacity: 0;
  transform: translateY(6px);
}

.page-leave-to {
  opacity: 0;
}

@media (max-width: 768px) {
  .app-main {
    margin-left: 0;
  }

  .app-header {
    min-height: 58px;
    padding: 10px 14px;
  }

  .header-title h1 {
    font-size: 17px;
  }

  .local-badge {
    display: none;
  }
}
</style>
