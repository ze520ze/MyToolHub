import type {
  CreateMockGroupInput,
  CreateMockInterfaceInput,
  MockDeleteResult,
  MockGroupMutationResult,
  MockGroupWithInterfaces,
  MockInterfaceMutationResult,
  MockMasterResult,
  MockRuntimeStatus,
  MockToggleInterfaceResult,
  RequestLog,
  UpdateMockGroupInput,
  UpdateMockInterfaceInput,
} from '@mytoolhub/shared';
import { http } from './http';

export const mockApi = {
  async getGroups(): Promise<MockGroupWithInterfaces[]> {
    const { data } = await http.get<MockGroupWithInterfaces[]>('/mock/groups');
    return data;
  },

  async getStatus(): Promise<MockRuntimeStatus> {
    const { data } = await http.get<MockRuntimeStatus>('/mock/status');
    return data;
  },

  async getLogs(): Promise<RequestLog[]> {
    const { data } = await http.get<{ logs: RequestLog[] }>('/mock/logs');
    return data.logs;
  },

  async createGroup(input: CreateMockGroupInput): Promise<MockGroupMutationResult> {
    const { data } = await http.post<MockGroupMutationResult>('/mock/groups', input);
    return data;
  },

  async updateGroup(
    id: string,
    input: UpdateMockGroupInput,
  ): Promise<MockGroupMutationResult> {
    const { data } = await http.put<MockGroupMutationResult>(
      '/mock/groups/' + id,
      input,
    );
    return data;
  },

  async deleteGroup(id: string): Promise<MockDeleteResult> {
    const { data } = await http.delete<MockDeleteResult>('/mock/groups/' + id);
    return data;
  },

  async createInterface(
    input: CreateMockInterfaceInput,
  ): Promise<MockInterfaceMutationResult> {
    const { data } = await http.post<MockInterfaceMutationResult>(
      '/mock/interfaces',
      input,
    );
    return data;
  },

  async updateInterface(
    id: string,
    input: UpdateMockInterfaceInput,
  ): Promise<MockInterfaceMutationResult> {
    const { data } = await http.put<MockInterfaceMutationResult>(
      '/mock/interfaces/' + id,
      input,
    );
    return data;
  },

  async deleteInterface(id: string): Promise<MockDeleteResult> {
    const { data } = await http.delete<MockDeleteResult>(
      '/mock/interfaces/' + id,
    );
    return data;
  },

  async enableInterface(id: string): Promise<MockToggleInterfaceResult> {
    const { data } = await http.post<MockToggleInterfaceResult>(
      '/mock/interfaces/' + id + '/enable',
    );
    return data;
  },

  async disableInterface(id: string): Promise<MockToggleInterfaceResult> {
    const { data } = await http.post<MockToggleInterfaceResult>(
      '/mock/interfaces/' + id + '/disable',
    );
    return data;
  },

  async toggleMaster(enabled: boolean): Promise<MockMasterResult> {
    const { data } = await http.post<MockMasterResult>('/mock/master/toggle', {
      enabled,
    });
    return data;
  },

  async restart(): Promise<MockMasterResult> {
    const { data } = await http.post<MockMasterResult>('/mock/restart');
    return data;
  },

};
