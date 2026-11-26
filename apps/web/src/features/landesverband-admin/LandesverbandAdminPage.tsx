import { SKILL_CATEGORY_LABELS } from '@gruenerator/shared/agents';
import { Badge, Button, Skeleton, Switch, Textarea, toast } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { type IconType } from 'react-icons';
import { FiEdit3, FiBookOpen, FiUsers } from 'react-icons/fi';
import { useParams } from 'react-router-dom';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import ErrorBoundary from '../../components/ErrorBoundary';
import AdminShell, { type AdminNavGroup } from '../admin/components/AdminShell';
import { AdminEmptyState, AdminPageHeader, AdminPanel } from '../admin/components/adminUi';
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
    <AdminPanel
      className="max-w-2xl"
      title="Begrüßungstext"
      description="Wird Mitgliedern dieses Landesverbands als persönliche Begrüßung angezeigt. Reiner Text, kein Markdown."
    >
      <div className="flex flex-col gap-md">
        <Textarea
          aria-label="Begrüßungstext"
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
    </AdminPanel>
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
    <div className="flex flex-col gap-md">
      {grouped.length === 0 && <AdminEmptyState>Keine Rezepte vorhanden.</AdminEmptyState>}
      {grouped.map(([category, categorySkills]) => (
        <AdminPanel
          key={category}
          flush
          title={(SKILL_CATEGORY_LABELS as Record<string, string>)[category] ?? category}
        >
          <div className="flex flex-col divide-y divide-grey-200 dark:divide-grey-800">
            {categorySkills.map((skill) => (
              <div
                key={skill.mention}
                className="flex items-center justify-between gap-md px-md py-sm"
              >
                <div className="min-w-0 flex items-center gap-sm">
                  <div>
                    <p className="text-sm font-medium text-foreground-heading m-0 truncate">
                      {skill.title}
                    </p>
                    <p className="m-0 truncate text-xs text-grey-600 dark:text-grey-400">
                      @{skill.mention}
                    </p>
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
        </AdminPanel>
      ))}
    </div>
  );
}

function UsersTab({ landesverbandId }: { landesverbandId: string }) {
  const { data: users, isLoading } = useLandesverbandUsers(landesverbandId);
  return (
    <div className="flex flex-col gap-md">
      {!isLoading && (
        <p className="m-0 text-sm text-grey-600 tabular-nums dark:text-grey-400">
          {users?.length ?? 0} {users?.length === 1 ? 'Person' : 'Personen'}
        </p>
      )}
      <AdminPanel flush>
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
      </AdminPanel>
    </div>
  );
}

const SECTIONS: Record<Tab, { label: string; description: string; icon: IconType }> = {
  begruessung: {
    label: 'Begrüßung',
    description: 'Der Text, mit dem Mitglieder dieses Landesverbands begrüßt werden.',
    icon: FiEdit3,
  },
  rezepte: {
    label: 'Rezepte',
    description: 'Welche Rezepte Mitglieder dieses Landesverbands sehen.',
    icon: FiBookOpen,
  },
  nutzer: {
    label: 'Nutzer:innen',
    description: 'Mitglieder dieses Landesverbands.',
    icon: FiUsers,
  },
};

function LandesverbandAdminPage() {
  const { lvId, tab } = useParams<{ lvId: string; tab?: string }>();
  const { data: detail } = useLandesverbandDetail(lvId ?? null);

  if (!lvId) return null;
  const activeTab: Tab = isTab(tab) ? tab : 'begruessung';
  const section = SECTIONS[activeTab];

  const nav: AdminNavGroup[] = [
    {
      key: 'lv',
      items: TABS.map((id) => ({
        to: `/admin/landesverband/${lvId}/${id}`,
        label: SECTIONS[id].label,
        icon: SECTIONS[id].icon,
        active: id === activeTab,
      })),
    },
  ];

  return (
    <RequireAdmin type="lvAdmin" landesverbandId={lvId}>
      <ErrorBoundary>
        <AdminShell
          navLabel="Landesverband verwalten"
          heading={
            <div className="flex flex-col gap-sm">
              <span className="font-[Raleway] text-lg font-bold text-foreground-heading">
                {detail?.name ?? 'Landesverband'}
              </span>
              <LandesverbandSwitcher currentLvId={lvId} />
            </div>
          }
          nav={nav}
        >
          <AdminPageHeader title={section.label} description={section.description} />
          {activeTab === 'begruessung' && <GreetingTab landesverbandId={lvId} />}
          {activeTab === 'rezepte' && <SkillsTab landesverbandId={lvId} />}
          {activeTab === 'nutzer' && <UsersTab landesverbandId={lvId} />}
        </AdminShell>
      </ErrorBoundary>
    </RequireAdmin>
  );
}

export default withAuthRequired(LandesverbandAdminPage, {
  title: 'Landesverband-Admin',
});
