import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import { Badge, Input, Skeleton, Switch } from '@gruenerator/ui';
import { memo, useCallback, useId, useMemo, useState } from 'react';

import { AdminEmptyState, AdminPanel } from '../components/adminUi';
import { useAdminSkills, useSetSkillHidden, type AdminSkill } from '../hooks/useAdminSkills';
import { useProgressiveCount } from '../hooks/useProgressiveCount';

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
  const [query, setQuery] = useState('');
  const searchId = useId();

  const needle = query.trim().toLowerCase();
  const grouped = useMemo(() => {
    const map = new Map<string, AdminSkill[]>();
    for (const skill of skills ?? []) {
      if (needle && !`${skill.title} ${skill.mention}`.toLowerCase().includes(needle)) continue;
      const key = skill.skillCategory ?? 'sonstiges';
      const list = map.get(key) ?? [];
      list.push(skill);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [skills, needle]);

  // 81 Zeilen mit Schaltern auf einmal sind der teuerste Klick im Admin;
  // das erste Bild zeigt den Anfang, der Rest kommt Frame für Frame nach.
  const matchCount = grouped.reduce((n, [, list]) => n + list.length, 0);
  const shown = useProgressiveCount(matchCount);
  const { mutate: setHidden, isPending, variables } = setHiddenMutation;
  const pendingMention = isPending ? (variables?.mention ?? null) : null;
  const toggle = useCallback(
    (mention: string, hidden: boolean) => setHidden({ mention, hidden }),
    [setHidden]
  );

  if (isLoading) {
    return (
      <div className="flex flex-col gap-md">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  const total = skills?.length ?? 0;
  const hiddenCount = (skills ?? []).filter((s) => s.hidden).length;

  if (total === 0) return <AdminEmptyState>Diese Instanz führt keine Rezepte.</AdminEmptyState>;

  return (
    <div className="flex flex-col gap-md">
      <div className="flex flex-wrap items-center justify-between gap-sm">
        <div className="w-full sm:max-w-sm">
          <label htmlFor={searchId} className="sr-only">
            Rezepte durchsuchen
          </label>
          <Input
            id={searchId}
            type="search"
            placeholder="Rezept oder @-Erwähnung suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <p className="m-0 text-sm text-grey-600 dark:text-grey-400" aria-live="polite">
          {total - hiddenCount} sichtbar · {hiddenCount} ausgeblendet
        </p>
      </div>

      {grouped.length === 0 && (
        <AdminEmptyState>Keine Rezepte für „{query.trim()}“.</AdminEmptyState>
      )}

      {grouped.map(([category, categorySkills], groupIndex) => {
        const before = grouped.slice(0, groupIndex).reduce((n, [, list]) => n + list.length, 0);
        const visible = categorySkills.slice(0, Math.max(0, shown - before));
        if (visible.length === 0) return null;
        return (
          <AdminPanel
            key={category}
            flush
            title={(SKILL_CATEGORY_LABELS as Record<string, string>)[category] ?? category}
            aside={
              <span className="text-grey-600 tabular-nums dark:text-grey-400">
                {categorySkills.length}
              </span>
            }
          >
            <ul className="m-0 flex list-none flex-col divide-y divide-grey-200 border-t border-grey-200 p-0 dark:divide-grey-800 dark:border-grey-800">
              {visible.map((skill) => (
                <SkillRow
                  key={skill.mention}
                  skill={skill}
                  pending={pendingMention === skill.mention}
                  onToggle={toggle}
                />
              ))}
            </ul>
          </AdminPanel>
        );
      })}
    </div>
  );
}

const SkillRow = memo(function SkillRow({
  skill,
  pending,
  onToggle,
}: {
  skill: AdminSkill;
  pending: boolean;
  onToggle: (mention: string, hidden: boolean) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-md px-md py-sm">
      <div className="min-w-0">
        <p className="m-0 truncate text-sm font-medium text-foreground-heading">{skill.title}</p>
        <p className="m-0 truncate text-xs text-grey-600 dark:text-grey-400">@{skill.mention}</p>
      </div>
      <div className="flex shrink-0 items-center gap-sm">
        {skill.hidden && <Badge variant="outline">instanzweit ausgeblendet</Badge>}
        <Switch
          checked={!skill.hidden}
          disabled={pending}
          onCheckedChange={(checked) => onToggle(skill.mention, !checked)}
          aria-label={`${skill.title} ${skill.hidden ? 'einblenden' : 'ausblenden'}`}
        />
      </div>
    </li>
  );
});
