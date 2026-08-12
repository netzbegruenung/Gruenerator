import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import {
  Badge,
  Button,
  SectionHeader,
  Skeleton,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import AdminUserTable from '../admin/components/AdminUserTable';
import RequireAdmin from '../admin/components/RequireAdmin';

import {
  useLandesverbandDetail,
  useUpdateLandesverbandGreeting,
  useLandesverbandSkills,
  useSetLandesverbandSkillHidden,
  useLandesverbandUsers,
} from './hooks/useLandesverbandAdmin';
import LandesverbandSwitcher from './LandesverbandSwitcher';

const TABS = ['begruessung', 'rezepte', 'nutzer'] as const;
type Tab = (typeof TABS)[number];

function isTab(value: string | undefined): value is Tab {
  return TABS.includes(value as Tab);
}

function GreetingTab({ landesverbandId }: { landesverbandId: string }) {
  const { data: detail, isLoading } = useLandesverbandDetail(landesverbandId);
  const updateMutation = useUpdateLandesverbandGreeting();
  // Server value until the person types — avoids seeding local state from an
  // async query result inside an effect (cascading-render lint rule).
  const [override, setOverride] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-sm">
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const savedText = detail?.greetingText ?? '';
  const draft = override ?? savedText;
  const dirty = draft !== savedText;

  return (
    <div className="flex flex-col gap-md max-w-2xl">
      <p className="text-sm text-grey-500 dark:text-grey-400 m-0">
        Wird Mitgliedern dieses Landesverbands als persönliche Begrüßung angezeigt. Reiner Text,
        kein Markdown.
      </p>
      <Textarea
        value={draft}
        onChange={(e) => setOverride(e.target.value)}
        rows={6}
        placeholder="Begrüßungstext für dieses Landesverband…"
      />
      <div>
        <Button
          onClick={() =>
            updateMutation.mutate(
              { landesverbandId, greetingText: draft.trim().length > 0 ? draft : null },
              {
                onSuccess: () => {
                  setOverride(null);
                  toast.success('Begrüßungstext gespeichert.');
                },
                onError: () => toast.error('Begrüßungstext konnte nicht gespeichert werden.'),
              }
            )
          }
          disabled={!dirty || updateMutation.isPending}
        >
          {updateMutation.isPending ? 'Speichert…' : 'Speichern'}
        </Button>
      </div>
    </div>
  );
}

function SkillsTab({ landesverbandId }: { landesverbandId: string }) {
  const { data: skills, isLoading } = useLandesverbandSkills(landesverbandId);
  const setHiddenMutation = useSetLandesverbandSkillHidden(landesverbandId);

  const grouped = useMemo(() => {
    const map = new Map<string, NonNullable<typeof skills>>();
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
    <div>
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
                <div className="min-w-0 flex items-center gap-sm">
                  <div>
                    <p className="text-sm font-medium text-foreground-heading m-0 truncate">
                      {skill.title}
                    </p>
                    <p className="text-xs text-grey-500 m-0 truncate">@{skill.mention}</p>
                  </div>
                  {skill.hiddenGlobally && (
                    <Badge variant="outline" className="text-xs">
                      Instanzweit ausgeblendet
                    </Badge>
                  )}
                </div>
                <Switch
                  checked={!skill.hiddenGlobally && !skill.hiddenForLv}
                  disabled={
                    skill.hiddenGlobally ||
                    (setHiddenMutation.isPending &&
                      setHiddenMutation.variables?.mention === skill.mention)
                  }
                  onCheckedChange={(checked) =>
                    setHiddenMutation.mutate({ mention: skill.mention, hidden: !checked })
                  }
                  aria-label={`${skill.title} für dieses Landesverband ${skill.hiddenForLv ? 'einblenden' : 'ausblenden'}`}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function UsersTab({ landesverbandId }: { landesverbandId: string }) {
  const { data: users, isLoading } = useLandesverbandUsers(landesverbandId);
  return (
    <AdminUserTable
      isLoading={isLoading}
      emptyLabel="Noch keine Mitglieder in diesem Landesverband."
      users={(users ?? []).map((u) => ({
        id: u.id,
        name: u.displayName ?? u.email ?? u.id,
        email: u.email,
        joinedAt: u.joinedAt,
        emailVerified: u.emailVerified,
      }))}
    />
  );
}

function LandesverbandAdminPage() {
  const { lvId, tab } = useParams<{ lvId: string; tab?: string }>();
  const navigate = useNavigate();
  const { data: detail } = useLandesverbandDetail(lvId ?? null);

  if (!lvId) return null;
  const activeTab: Tab = isTab(tab) ? tab : 'begruessung';

  return (
    <RequireAdmin type="lvAdmin" landesverbandId={lvId}>
      <ErrorBoundary>
        <PageContainer maxWidth="md">
          <div className="mb-lg pt-md flex flex-wrap items-center justify-between gap-md">
            <div>
              <h1 className="text-3xl font-semibold text-foreground-heading mb-xs">
                {detail?.name ?? 'Landesverband'}
              </h1>
              <p className="text-lg text-grey-500 dark:text-grey-400 m-0">
                Begrüßung, Rezepte-Sichtbarkeit und Mitglieder dieses Landesverbands verwalten.
              </p>
            </div>
            <LandesverbandSwitcher currentLvId={lvId} />
          </div>

          <Tabs
            value={activeTab}
            onValueChange={(value) => navigate(`/admin/landesverband/${lvId}/${value}`)}
          >
            <TabsList>
              <TabsTrigger value="begruessung">Begrüßung</TabsTrigger>
              <TabsTrigger value="rezepte">Rezepte</TabsTrigger>
              <TabsTrigger value="nutzer">Nutzer:innen</TabsTrigger>
            </TabsList>

            <TabsContent value="begruessung">
              <GreetingTab landesverbandId={lvId} />
            </TabsContent>
            <TabsContent value="rezepte">
              <SkillsTab landesverbandId={lvId} />
            </TabsContent>
            <TabsContent value="nutzer">
              <UsersTab landesverbandId={lvId} />
            </TabsContent>
          </Tabs>
        </PageContainer>
      </ErrorBoundary>
    </RequireAdmin>
  );
}

export default withAuthRequired(LandesverbandAdminPage, {
  title: 'Landesverband-Admin',
});
