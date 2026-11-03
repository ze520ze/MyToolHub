<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import {
  ArrowRight,
  Connection,
  Grid,
  Lightning,
  Monitor,
} from '@element-plus/icons-vue';
import { navigationItems } from '@/router';

const router = useRouter();
const tools = computed(() => navigationItems.filter((item) => item.path !== '/'));

function open(path: string): void {
  void router.push(path);
}
</script>

<template>
  <div class="home-page">
    <section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">
          <el-icon><Grid /></el-icon>
          PERSONAL TOOLBOX
        </span>
        <h1>把常用的小工具，<br /><em>放进一个工作台。</em></h1>
        <p>
          MyToolHub 是一个单机运行的个人工具集。当前内置 Mock 服务器，
          后续可继续添加串口调试、协议分析、数据转换等功能。
        </p>
        <div class="hero-actions">
          <el-button
            v-if="tools[0]"
            type="primary"
            size="large"
            :icon="Connection"
            @click="open(tools[0].path)"
          >
            打开 {{ tools[0].title }}
          </el-button>
          <el-button size="large" :icon="Monitor" @click="open('/')">
            查看工作台
          </el-button>
        </div>
        <div class="hero-facts">
          <span><strong>{{ tools.length }}</strong> 个功能模块</span>
          <span class="divider" />
          <span><strong>单机</strong> 本地运行</span>
          <span class="divider" />
          <span><strong>局域网</strong> 可访问</span>
        </div>
      </div>

      <div class="hero-visual" aria-hidden="true">
        <div class="visual-orbit orbit-one" />
        <div class="visual-orbit orbit-two" />
        <div class="terminal-card">
          <div class="terminal-head">
            <span class="dot red" />
            <span class="dot amber" />
            <span class="dot green" />
            <span class="terminal-title">mock.preview</span>
          </div>
          <pre><span class="muted-code">GET</span> /api/test  <span class="ok-code">200 OK</span>

{
  "code": 0,
  "message": "ok",
  "data": {
    "name": "MyToolHub"
  }
}</pre>
        </div>
        <div class="floating-chip chip-top">
          <el-icon><Lightning /></el-icon>
          实时日志
        </div>
        <div class="floating-chip chip-bottom">
          <span class="pulse" />
          服务已就绪
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="section-head">
        <div>
          <span class="section-kicker">TOOLS</span>
          <h2>功能模块</h2>
        </div>
        <span class="section-note">新增模块只需添加路由，首页会自动出现入口</span>
      </div>

      <div class="tool-grid">
        <article
          v-for="(item, index) in tools"
          :key="item.path"
          class="tool-card"
          :style="{ '--delay': index * 60 + 'ms' }"
          tabindex="0"
          role="button"
          @click="open(item.path)"
          @keydown.enter="open(item.path)"
        >
          <div class="tool-icon">
            <el-icon :size="24"><component :is="item.icon" /></el-icon>
          </div>
          <div class="tool-body">
            <div class="tool-title-row">
              <h3>{{ item.title }}</h3>
              <el-icon class="tool-arrow"><ArrowRight /></el-icon>
            </div>
            <p>{{ item.description }}</p>
          </div>
          <span class="tool-index">{{ String(index + 1).padStart(2, '0') }}</span>
        </article>

        <div v-if="tools.length === 0" class="empty-tools">
          <el-empty description="还没有功能模块" />
        </div>
      </div>
    </section>

    <section class="section-block quick-start">
      <div class="section-head">
        <div>
          <span class="section-kicker">QUICK START</span>
          <h2>三步开始调试</h2>
        </div>
      </div>
      <div class="step-grid">
        <div class="step">
          <span class="step-number">01</span>
          <h3>创建分组</h3>
          <p>按业务或项目把接口归类，分组可以统一启停。</p>
        </div>
        <div class="step">
          <span class="step-number">02</span>
          <h3>配置接口</h3>
          <p>填写端口、路径、HTTP 方法和响应数据，支持多行 JSON。</p>
        </div>
        <div class="step">
          <span class="step-number">03</span>
          <h3>发起请求</h3>
          <p>开启总开关后访问地址，日志面板会实时显示请求记录。</p>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  gap: 26px;
  max-width: 1180px;
  margin: 0 auto;
}

.hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
  gap: 28px;
  align-items: center;
  padding: 44px 42px;
  overflow: hidden;
  background:
    radial-gradient(circle at 88% 18%, rgba(6, 182, 212, 0.18), transparent 34%),
    radial-gradient(circle at 8% 88%, rgba(79, 70, 229, 0.13), transparent 36%),
    #ffffff;
  border: 1px solid var(--app-border);
  border-radius: 22px;
  box-shadow: var(--shadow-soft);
}

.hero::before {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: '';
  background-image: linear-gradient(rgba(15, 23, 42, 0.03) 1px, transparent 1px),
    linear-gradient(90deg, rgba(15, 23, 42, 0.03) 1px, transparent 1px);
  background-size: 34px 34px;
  mask-image: linear-gradient(to bottom, rgba(0, 0, 0, 0.6), transparent 78%);
}

.hero-copy {
  position: relative;
  z-index: 2;
}

.eyebrow {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  padding: 5px 10px;
  margin-bottom: 18px;
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-primary);
  letter-spacing: 0.16em;
  background: #eef2ff;
  border-radius: 999px;
}

.hero h1 {
  margin: 0;
  font-size: clamp(30px, 4vw, 45px);
  font-weight: 800;
  line-height: 1.18;
  color: var(--text-strong);
  letter-spacing: -0.035em;
}

.hero h1 em {
  font-style: normal;
  color: var(--brand-primary);
  background: linear-gradient(100deg, var(--brand-primary), var(--brand-accent));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hero p {
  max-width: 520px;
  margin: 18px 0 0;
  font-size: 14px;
  line-height: 1.85;
  color: var(--text-muted);
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 24px;
}

.hero-facts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin-top: 26px;
  font-size: 11px;
  color: #94a3b8;
}

.hero-facts strong {
  color: #334155;
  font-weight: 700;
}

.divider {
  width: 1px;
  height: 11px;
  background: #e2e8f0;
}

.hero-visual {
  position: relative;
  z-index: 2;
  min-height: 270px;
}

.visual-orbit {
  position: absolute;
  border: 1px dashed rgba(79, 70, 229, 0.18);
  border-radius: 50%;
}

.orbit-one {
  inset: 12px 8px 28px 30px;
}

.orbit-two {
  inset: 48px 44px 62px 66px;
  border-color: rgba(6, 182, 212, 0.2);
}

.terminal-card {
  position: absolute;
  top: 40px;
  right: 14px;
  left: 26px;
  overflow: hidden;
  background: #0b1220;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  box-shadow: 0 22px 46px rgba(15, 23, 42, 0.24);
  transform: rotate(-1.4deg);
}

.terminal-head {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(148, 163, 184, 0.12);
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
}

.dot.red {
  background: #fb7185;
}

.dot.amber {
  background: #fbbf24;
}

.dot.green {
  background: #34d399;
}

.terminal-title {
  margin-left: 5px;
  font-family: var(--font-mono);
  font-size: 9px;
  color: #64748b;
}

.terminal-card pre {
  padding: 16px 17px 20px;
  margin: 0;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: 10.5px;
  line-height: 1.85;
  color: #cbd5e1;
}

.muted-code {
  color: #a5b4fc;
}

.ok-code {
  color: #34d399;
}

.floating-chip {
  position: absolute;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 10px;
  font-size: 10px;
  font-weight: 600;
  color: #334155;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
}

.chip-top {
  top: 12px;
  right: 6px;
  color: var(--brand-primary);
}

.chip-bottom {
  bottom: 18px;
  left: 6px;
}

.pulse {
  width: 6px;
  height: 6px;
  background: #10b981;
  border-radius: 50%;
  box-shadow: 0 0 0 4px rgba(16, 185, 129, 0.15);
}

.section-block {
  padding: 4px 2px;
}

.section-head {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 14px;
}

.section-kicker {
  font-size: 9px;
  font-weight: 800;
  color: #94a3b8;
  letter-spacing: 0.2em;
}

.section-head h2 {
  margin: 4px 0 0;
  font-size: 19px;
  font-weight: 750;
  color: var(--text-strong);
  letter-spacing: -0.02em;
}

.section-note {
  font-size: 11px;
  color: #94a3b8;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.tool-card {
  position: relative;
  display: flex;
  gap: 14px;
  align-items: flex-start;
  padding: 19px;
  overflow: hidden;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--app-border);
  border-radius: 15px;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.02);
  opacity: 0;
  animation: card-in 0.45s ease forwards;
  animation-delay: var(--delay);
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.tool-card:hover,
.tool-card:focus-visible {
  border-color: #c7d2fe;
  outline: none;
  box-shadow: 0 16px 30px rgba(79, 70, 229, 0.09);
  transform: translateY(-2px);
}

.tool-icon {
  display: grid;
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  color: var(--brand-primary);
  background: #eef2ff;
  border-radius: 12px;
  place-items: center;
}

.tool-body {
  flex: 1;
  min-width: 0;
}

.tool-title-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.tool-title-row h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
}

.tool-arrow {
  color: #cbd5e1;
  transition: color 0.2s ease, transform 0.2s ease;
}

.tool-card:hover .tool-arrow {
  color: var(--brand-primary);
  transform: translateX(2px);
}

.tool-body p {
  margin: 7px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--text-muted);
}

.tool-index {
  position: absolute;
  right: 12px;
  bottom: 8px;
  font-family: var(--font-mono);
  font-size: 24px;
  font-weight: 800;
  color: rgba(15, 23, 42, 0.035);
}

.empty-tools {
  grid-column: 1 / -1;
}

.quick-start .step-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.step {
  position: relative;
  padding: 18px;
  background: rgba(255, 255, 255, 0.68);
  border: 1px solid var(--app-border);
  border-radius: 14px;
}

.step-number {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  color: var(--brand-primary);
}

.step h3 {
  margin: 8px 0 5px;
  font-size: 13px;
  color: var(--text-strong);
}

.step p {
  margin: 0;
  font-size: 11px;
  line-height: 1.7;
  color: var(--text-muted);
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1024px) {
  .hero {
    padding: 32px;
  }

  .tool-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .home-page {
    gap: 18px;
  }

  .hero {
    display: block;
    padding: 24px 20px;
  }

  .hero-visual {
    display: none;
  }

  .hero h1 {
    font-size: 29px;
  }

  .hero p {
    font-size: 12.5px;
  }

  .hero-actions :deep(.el-button) {
    flex: 1;
  }

  .section-note {
    display: none;
  }

  .tool-grid,
  .quick-start .step-grid {
    grid-template-columns: 1fr;
  }

  .tool-card {
    padding: 16px;
  }
}
</style>
