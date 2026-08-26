import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import { SectionHeader, Skeleton, Switch } from '@gruenerator/ui';
import { useMemo } from 'react';

import { useAdminSkills, useSetSkillHidden, type AdminSkill } from '../hooks/useAdminSkills';

/**
 * Aufgezählt wird, was die Instanz führt — die Liste kommt bereits gefiltert
 * vom Server (`skillVisibilityContractRouter`, `isSkillOfferedIn`). Der
 * Schalter hier ist die zweite, laufzeitseitige Stufe: er schreibt nach
 * `admin_hidden_skills` und wirkt nur auf Entdeckungsflächen, ein bestehender
 * Link oder eine getippte @-Erwähnung löst weiter auf.
 */
export default function SkillsTab() {
  const { data: skills, isLoading } = useAdminSkills(true);
  const setHiddenMutation = useSetSkillHidden();

  const grouped = useMemo(() => {
    const map = new Map<string, AdminSkill[]>();
    for (const skill of skills ?? []) {
      const key = skill.skillCategory ?? 'sonstiges';
      const list = map.get(key) ?? [];
      list.push(skill);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [skills]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }

  return (
    <>
      {grouped.map(([category, categorySkills]) => (
        <section key={category} className="mb-xl">
          <SectionHeader
            title={(SKILL_CATEGORY_LABELS as Record<string, string>)[category] ?? category}
          />
          <div className="flex flex-col gap-1">
            {categorySkills.map((skill) => (
              <div
                key={skill.mention}
                className="flex items-center justify-between gap-md rounded-md border border-grey-200 dark:border-grey-700 px-md py-sm"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground-heading m-0 truncate">
                    {skill.title}
                  </p>
                  <p className="text-xs text-grey-500 m-0 truncate">@{skill.mention}</p>
                </div>
                <Switch
                  checked={!skill.hidden}
                  disabled={
                    setHiddenMutation.isPending &&
                    setHiddenMutation.variables?.mention === skill.mention
                  }
                  onCheckedChange={(checked) =>
                    setHiddenMutation.mutate({ mention: skill.mention, hidden: !checked })
                  }
                  aria-label={`${skill.title} ${skill.hidden ? 'einblenden' : 'ausblenden'}`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
