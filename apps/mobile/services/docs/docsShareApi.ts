import { apiRequest } from '@gruenerator/shared/api';

export type ShareMode = 'private' | 'authenticated' | 'public';
export type PermissionLevel = 'owner' | 'editor' | 'viewer';

export interface ShareSettings {
  is_public: boolean;
  share_permission: 'viewer' | 'editor';
  share_mode: ShareMode;
}

export interface UserCollaborator {
  type?: 'user';
  user_id: string;
  display_name: string;
  email: string;
  avatar_robot_id?: number;
  permission_level: PermissionLevel;
  granted_at: string;
}

export interface GroupCollaborator {
  type: 'group';
  group_id: string;
  group_name: string;
  permission_level: 'editor' | 'viewer';
  shared_at: string;
  member_count: number;
}

export interface GroupSummary {
  id: string;
  name: string;
}

export const docsShareApi = {
  async getShareSettings(docId: string): Promise<ShareSettings> {
    const res = await apiRequest<ShareSettings>('get', `/docs/${docId}/share`);
    return res || { is_public: false, share_permission: 'viewer', share_mode: 'private' };
  },

  async updateShareMode(docId: string, mode: ShareMode): Promise<void> {
    if (mode === 'private') {
      await apiRequest('post', `/docs/${docId}/share/disable`);
    } else {
      await apiRequest('post', `/docs/${docId}/share/enable`);
      await apiRequest('put', `/docs/${docId}/share/mode`, { mode });
    }
  },

  async updateSharePermission(docId: string, permission: 'viewer' | 'editor'): Promise<void> {
    await apiRequest('put', `/docs/${docId}/share/permission`, { permission });
  },

  async getCollaborators(docId: string): Promise<{
    users: UserCollaborator[];
    groups: GroupCollaborator[];
  }> {
    const res = await apiRequest<{ users: UserCollaborator[]; groups: GroupCollaborator[] }>(
      'get',
      `/docs/${docId}/permissions`
    );
    return res || { users: [], groups: [] };
  },

  async addCollaborator(
    docId: string,
    userId: string,
    level: PermissionLevel
  ): Promise<void> {
    await apiRequest('post', `/docs/${docId}/permissions`, {
      user_id: userId,
      permission_level: level,
    });
  },

  async updateCollaborator(
    docId: string,
    userId: string,
    level: PermissionLevel
  ): Promise<void> {
    await apiRequest('put', `/docs/${docId}/permissions/${userId}`, {
      permission_level: level,
    });
  },

  async removeCollaborator(docId: string, userId: string): Promise<void> {
    await apiRequest('delete', `/docs/${docId}/permissions/${userId}`);
  },

  async getUserGroups(): Promise<GroupSummary[]> {
    const res = await apiRequest<GroupSummary[]>('get', '/docs/user-groups');
    return res || [];
  },

  async shareWithGroup(
    docId: string,
    groupId: string,
    level: 'editor' | 'viewer'
  ): Promise<void> {
    await apiRequest('post', `/docs/${docId}/groups`, {
      group_id: groupId,
      permission_level: level,
    });
  },

  async updateGroupPermission(
    docId: string,
    groupId: string,
    level: 'editor' | 'viewer'
  ): Promise<void> {
    await apiRequest('put', `/docs/${docId}/groups/${groupId}`, {
      permission_level: level,
    });
  },

  async unshareFromGroup(docId: string, groupId: string): Promise<void> {
    await apiRequest('delete', `/docs/${docId}/groups/${groupId}`);
  },
};
