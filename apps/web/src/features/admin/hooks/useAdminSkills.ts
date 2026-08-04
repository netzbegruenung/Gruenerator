import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { fetchAdminSkills, setSkillHidden } from '../../../hooks/useAdminSkillsTyped';

export interface AdminSkill {
  mention: string;
  identifier: string;
  title: string;
  skillCategory: string | null;
  hidden: boolean;
}

export function useAdminSkills(enabled = true) {
  return useQuery<AdminSkill[]>({
    queryKey: ['admin-skills'],
    queryFn: () => fetchAdminSkills() as Promise<AdminSkill[]>,
    staleTime: 30_000,
    enabled,
  });
}

export function useSetSkillHidden() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mention, hidden }: { mention: string; hidden: boolean }) =>
      setSkillHidden(mention, hidden),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-skills'] });
      // The public visibility endpoint every discovery surface reads —
      // invalidate so a toggle in this tab is reflected without a reload.
      void qc.invalidateQueries({ queryKey: ['admin-hidden-skills'] });
    },
  });
}
