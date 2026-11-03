import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import {
  SOCKET_EVENT_NEW_LOG,
  type CreateMockGroupInput,
  type CreateMockInterfaceInput,
  type MockDeleteResult,
  type MockGroupMutationResult,
  type MockGroupWithInterfaces,
  type MockInterfaceConfig,
  type MockInterfaceMutationResult,
  type MockMasterResult,
  type MockRuntimeStatus,
  type MockToggleInterfaceResult,
  type RequestLog,
  type UpdateMockGroupInput,
  type UpdateMockInterfaceInput,
} from '@mytoolhub/shared';
import { getErrorMessage } from '@/api/http';
import { mockApi } from '@/api/mock.api';
import { getLogSocket } from '@/api/socket';

const emptyStatus = (): MockRuntimeStatus => ({
  masterEnabled: false,
  running: false,
  runningInterfaces: 0,
  ports: [],
});

export const useMockStore = defineStore('mock', () => {
  const groups = ref<MockGroupWithInterfaces[]>([]);
  const logs = ref<RequestLog[]>([]);
  const status = ref<MockRuntimeStatus>(emptyStatus());
  const loading = ref(false);
  const switchingMaster = ref(false);
  const realtimeConnected = ref(false);
  const initialized = ref(false);
  const initError = ref('');

  let initPromise: Promise<void> | null = null;
  let socketBound = false;

  const interfaces = computed<MockInterfaceConfig[]>(() =>
    groups.value.flatMap((group) => group.interfaces),
  );

  const enabledInterfaceCount = computed(
    () => interfaces.value.filter((item) => item.enabled).length,
  );

  function applyStatus(source: MockRuntimeStatus): void {
    status.value = {
      masterEnabled: source.masterEnabled,
      running: source.running,
      runningInterfaces: source.runningInterfaces,
      ports: [...source.ports],
    };
  }

  function addLog(log: RequestLog): void {
    if (logs.value.some((item) => item.id === log.id)) return;
    logs.value.unshift(log);
    if (logs.value.length > 500) {
      logs.value.length = 500;
    }
  }

  async function fetchGroups(): Promise<void> {
    groups.value = await mockApi.getGroups();
  }

  async function fetchStatus(): Promise<void> {
    applyStatus(await mockApi.getStatus());
  }

  async function fetchLogs(): Promise<void> {
    const items = await mockApi.getLogs();
    logs.value = items.slice(0, 500);
  }

  async function refresh(): Promise<void> {
    await Promise.all([fetchGroups(), fetchStatus()]);
  }

  function bindSocket(): void {
    if (socketBound) return;
    socketBound = true;

    const socket = getLogSocket();
    socket.on('connect', () => {
      realtimeConnected.value = true;
    });
    socket.on('disconnect', () => {
      realtimeConnected.value = false;
    });
    socket.on('connect_error', () => {
      realtimeConnected.value = false;
    });
    socket.on(SOCKET_EVENT_NEW_LOG, (log) => {
      addLog(log);
    });

    if (!socket.connected) {
      socket.connect();
    } else {
      realtimeConnected.value = true;
    }
  }

  /**
   * 首次进入 Mock 页面时加载数据并绑定实时日志。
   * 顶部开关和页面本身可能同时调用，这里用 Promise 去重。
   */
  function initialize(): Promise<void> {
    if (initialized.value) return Promise.resolve();
    if (initPromise) return initPromise;

    initPromise = (async () => {
      loading.value = true;
      initError.value = '';
      try {
        await Promise.all([fetchGroups(), fetchStatus(), fetchLogs()]);
        bindSocket();
        initialized.value = true;
      } catch (error) {
        initError.value = getErrorMessage(error);
        throw error;
      } finally {
        loading.value = false;
        initPromise = null;
      }
    })();

    return initPromise;
  }

  async function createGroup(
    input: CreateMockGroupInput,
  ): Promise<MockGroupMutationResult> {
    const result = await mockApi.createGroup(input);
    await refresh();
    return result;
  }

  async function updateGroup(
    id: string,
    input: UpdateMockGroupInput,
  ): Promise<MockGroupMutationResult> {
    const result = await mockApi.updateGroup(id, input);
    await refresh();
    return result;
  }

  async function deleteGroup(id: string): Promise<MockDeleteResult> {
    const result = await mockApi.deleteGroup(id);
    await refresh();
    return result;
  }

  async function createInterface(
    input: CreateMockInterfaceInput,
  ): Promise<MockInterfaceConfig> {
    const result = await mockApi.createInterface(input);
    await refresh();
    return result.interface;
  }

  async function updateInterface(
    id: string,
    input: UpdateMockInterfaceInput,
  ): Promise<MockInterfaceMutationResult> {
    const result = await mockApi.updateInterface(id, input);
    await refresh();
    return result;
  }

  async function deleteInterface(id: string): Promise<MockDeleteResult> {
    const result = await mockApi.deleteInterface(id);
    await refresh();
    return result;
  }

  async function toggleInterface(
    id: string,
    enabled: boolean,
  ): Promise<MockToggleInterfaceResult> {
    const result = enabled
      ? await mockApi.enableInterface(id)
      : await mockApi.disableInterface(id);
    await refresh();
    return result;
  }

  async function setMaster(enabled: boolean): Promise<MockMasterResult> {
    switchingMaster.value = true;
    try {
      const result = await mockApi.toggleMaster(enabled);
      applyStatus(result);
      return result;
    } catch (error) {
      // 开启失败时后端会自动回滚，这里同步一次真实状态，避免开关显示错误
      await fetchStatus().catch(() => undefined);
      throw error;
    } finally {
      switchingMaster.value = false;
    }
  }

  async function restart(): Promise<MockMasterResult> {
    switchingMaster.value = true;
    try {
      const result = await mockApi.restart();
      applyStatus(result);
      return result;
    } catch (error) {
      // 启动失败时后端会回滚为关闭，同步真实状态避免界面显示仍在运行
      await fetchStatus().catch(() => undefined);
      throw error;
    } finally {
      switchingMaster.value = false;
    }
  }

  function clearLogs(): void {
    logs.value = [];
  }

  return {
    groups,
    logs,
    status,
    loading,
    switchingMaster,
    realtimeConnected,
    initialized,
    initError,
    interfaces,
    enabledInterfaceCount,
    initialize,
    refresh,
    fetchGroups,
    fetchStatus,
    fetchLogs,
    addLog,
    createGroup,
    updateGroup,
    deleteGroup,
    createInterface,
    updateInterface,
    deleteInterface,
    toggleInterface,
    setMaster,
    restart,
    clearLogs,
  };
});
