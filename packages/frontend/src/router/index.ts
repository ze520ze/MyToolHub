import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

declare module 'vue-router' {
  interface RouteMeta {
    /** 页面标题，同时用于侧边栏与首页卡片 */
    title?: string;
    /** Element Plus 图标组件名 */
    icon?: string;
    /** 首页卡片描述 */
    description?: string;
    /** 菜单排序，数字越小越靠前 */
    order?: number;
    /** 是否显示在侧边栏和首页 */
    showInMenu?: boolean;
    /** 顶栏功能开关的注册名，例如 mock-master */
    headerAction?: string;
  }
}

/**
 * 功能路由表。
 * 新增功能模块时，只在这里追加一项，侧边栏与首页卡片会自动出现。
 */
export const navigationRoutes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('@/views/HomeView.vue'),
    meta: {
      title: '首页',
      icon: 'HomeFilled',
      description: '所有工具的入口',
      order: 0,
      showInMenu: true,
    },
  },
  {
    path: '/mock',
    name: 'MockServer',
    component: () => import('@/views/mock/MockView.vue'),
    meta: {
      title: 'Mock 服务器',
      icon: 'Connection',
      description: '模拟 HTTP 接口响应，联调上位机与客户端',
      order: 1,
      showInMenu: true,
      headerAction: 'mock-master',
    },
  },
];

export interface NavigationItem {
  path: string;
  name: string;
  title: string;
  icon: string;
  description: string;
  order: number;
}

/** 侧边栏 / 首页使用的导航数据，按 order 排序 */
export const navigationItems: NavigationItem[] = navigationRoutes
  .filter((route) => route.meta?.showInMenu)
  .map((route) => ({
    path: route.path,
    name: String(route.name ?? route.path),
    title: route.meta?.title ?? String(route.name ?? ''),
    icon: route.meta?.icon ?? 'Grid',
    description: route.meta?.description ?? '',
    order: route.meta?.order ?? 999,
  }))
  .sort((a, b) => a.order - b.order);

const router = createRouter({
  history: createWebHistory(),
  routes: [
    ...navigationRoutes,
    {
      path: '/:pathMatch(.*)*',
      redirect: '/',
    },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  const title = to.meta.title;
  document.title = title ? `${title} · MyToolHub` : 'MyToolHub · 个人工具集';
});

export default router;
