import { type SiteGroupShare, type SiteMember, type SiteRole } from '@gruenerator/contracts';
import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { SitesApiError } from '../utils/errorHandler';

/** Thrown by member changes the server refuses to keep a site admin-less or ineligible. */
export class SiteMemberError extends SitesApiError {
  readonly code: 'last_admin' | 'not_eligible' | 'not_personal';

  constructor(status: number, message: string, code: SiteMemberError['code']) {
    super(status, message);
    this.name = 'SiteMemberError';
    this.code = code;
  }
}

const membersKey = (siteId: string) => ['sites', 'members', siteId] as const;
const groupsKey = (siteId: string) => ['sites', 'groups', siteId] as const;

function fail(res: { status: number; body: unknown }): never {
  const body = res.body as { error?: string; code?: SiteMemberError['code'] } | null;
  const message = body?.error ?? `HTTP ${res.status}`;
  if (body?.code) throw new SiteMemberError(res.status, message, body.code);
  throw new SitesApiError(res.status, message);
}

/** Everyone with access to a site, and the projects a personal site is shared into. */
export function useSiteSharing(siteId: string, enabled: boolean, personal: boolean) {
  const queryClient = useQueryClient();

  const members = useQuery<SiteMember[]>({
    queryKey: membersKey(siteId),
    enabled,
    queryFn: async () => {
      const res = await getContractsClient().sites.listSiteMembers({ params: { id: siteId } });
      if (res.status !== 200) return fail(res);
      return res.body.members;
    },
  });

  const groups = useQuery<SiteGroupShare[]>({
    queryKey: groupsKey(siteId),
    // A project site has no project shares (the server answers 409 for it): do not ask.
    enabled: enabled && personal,
    retry: false,
    queryFn: async () => {
      const res = await getContractsClient().sites.listSiteGroups({ params: { id: siteId } });
      if (res.status !== 200) return fail(res);
      return res.body.groups;
    },
  });

  const refreshMembers = () => queryClient.invalidateQueries({ queryKey: membersKey(siteId) });
  const refreshGroups = () => queryClient.invalidateQueries({ queryKey: groupsKey(siteId) });

  const setRole = useMutation({
    meta: { silent: true },
    mutationFn: async ({ userId, role }: { userId: string; role: SiteRole }) => {
      const res = await getContractsClient().sites.setSiteMemberRole({
        params: { id: siteId, userId },
        body: { role },
      });
      if (res.status !== 200) return fail(res);
    },
    onSettled: refreshMembers,
  });

  const removeMember = useMutation({
    meta: { silent: true },
    mutationFn: async (userId: string) => {
      const res = await getContractsClient().sites.removeSiteMember({
        params: { id: siteId, userId },
      });
      if (res.status !== 204) return fail(res);
    },
    onSettled: refreshMembers,
  });

  const shareToGroup = useMutation({
    meta: { silent: true },
    mutationFn: async ({ groupId, write }: { groupId: string; write: boolean }) => {
      const res = await getContractsClient().sites.setSiteGroup({
        params: { id: siteId, groupId },
        body: { write },
      });
      if (res.status !== 200) return fail(res);
    },
    onSettled: () => Promise.all([refreshGroups(), refreshMembers()]),
  });

  const unshareFromGroup = useMutation({
    meta: { silent: true },
    mutationFn: async (groupId: string) => {
      const res = await getContractsClient().sites.removeSiteGroup({
        params: { id: siteId, groupId },
      });
      if (res.status !== 204) return fail(res);
    },
    onSettled: () => Promise.all([refreshGroups(), refreshMembers()]),
  });

  return { members, groups, setRole, removeMember, shareToGroup, unshareFromGroup };
}

export interface SiteProject {
  id: string;
  name: string;
  isAdmin: boolean;
}

/**
 * The person's projects that can take a site: not the system project, not archived. Read through
 * the contracts client (not `@gruenerator/shared/groups`, whose sources this package's stricter
 * compiler options reject).
 */
export function useSiteProjects(enabled = true) {
  return useQuery<SiteProject[]>({
    queryKey: ['sites', 'projects'],
    enabled,
    staleTime: 60 * 1000,
    queryFn: async () => {
      const res = await getContractsClient().groups.listUserGroups();
      if (res.status !== 200) return fail(res);
      return (res.body.groups as unknown as Array<Record<string, unknown>>)
        .filter((g) => !g['is_system'] && !g['archived_at'])
        .map((g) => ({
          id: String(g['id']),
          name: String(g['name']),
          isAdmin: g['isAdmin'] === true,
        }));
    },
  });
}
