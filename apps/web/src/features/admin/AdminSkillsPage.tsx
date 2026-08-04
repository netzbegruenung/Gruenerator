import { SKILL_CATEGORY_LABELS, type SkillCategory } from '@gruenerator/shared/agents';
import { Button, SectionHeader, Skeleton, Switch } from '@gruenerator/ui';
import { useMemo } from 'react';
import { FaLock } from 'react-icons/fa';
import { Link } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { useAuthStore } from '../../stores/authStore';

import { useAdminSkills, useSetSkillHidden, type AdminSkill } from './hooks/useAdminSkills';

const AdminSkillsPage = () => {
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.is_admin === true;
  const { data: skills, isLoading } = useAdminSkills(isAdmin);
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

  if (!isAdmin) {
    return (
      <PageContainer maxWidth="md">
        <div className="flex flex-col items-center justify-center gap-md py-xl text-center">
          <FaLock aria-hidden className="text-5xl text-grey-400" />
          <h1 className="text-3xl font-semibold">Kein Zugriff</h1>
          <p className="text-grey-600 dark:text-grey-400">
            Du hast keine Berechtigung, den Administrationsbereich zu öffnen. Bitte wende dich an
            eine administrierende Person, falls du Zugriff benötigst.
          </p>
          <Button variant="brand" size="brand" asChild>
            <Link to="/workplace">Zurück zum Workplace</Link>
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <ErrorBoundary>
      <PageContainer maxWidth="md">
        <div className="mb-lg pt-md">
          <h1 className="text-3xl font-semibold text-foreground-heading mb-xs">Rezepte</h1>
          <p className="text-lg text-grey-500 dark:text-grey-400 m-0">
            Welche Rezepte diese Instanz im Katalog anbietet. Ausgeblendete Rezepte bleiben über
            einen bestehenden Link oder eine explizite @-Erwähnung weiter erreichbar.
          </p>
        </div>

        {isLoading ? (
          <div className="flex flex-col gap-sm">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          grouped.map(([category, categorySkills]) => (
            <section key={category} className="mb-xl">
              <SectionHeader
                title={SKILL_CATEGORY_LABELS[category as SkillCategory] ?? category}
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
          ))
        )}
      </PageContainer>
    </ErrorBoundary>
  );
};

export default withAuthRequired(AdminSkillsPage, {
  title: 'Rezepte verwalten',
});
