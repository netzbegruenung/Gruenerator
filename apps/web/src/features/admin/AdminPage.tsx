import { hasLandesverbandContentIn } from '@gruenerator/shared/agents';
import { isToolOfferedIn } from '@gruenerator/shared/instances';
import { SectionHeader, Tabs, TabsContent, TabsList, TabsTrigger } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';
import { CURRENT_INSTANCE } from '../../config/instance';

import RequireAdmin from './components/RequireAdmin';
import LandesverbandAssignmentTab from './landesverband-assignment/LandesverbandAssignmentTab';
import AgentsTab from './tabs/AgentsTab';
import RolesTab from './tabs/RolesTab';
import SkillsTab from './tabs/SkillsTab';
import UsersTab from './tabs/UsersTab';
import VorlagenTab from './tabs/VorlagenTab';

/**
 * Der Administrationsbereich einer Instanz.
 *
 * **Der Reitersatz wird abgeleitet, nicht aufgezählt.** Eine Instanz, die die
 * Vorlagen ausblendet, soll keine Vorlagen prüfen; eine ohne Landesverbände hat
 * niemanden zu verwalten. Beides steht schon in der Instanz-Registry
 * (`hide.toolIds`, `hide.notebookCategories`) — hier wird es nur gelesen. Kein
 * `if (instanceId === 'bgst')`: eine künftige Landes- oder Fraktions-Instanz
 * füllt dieselben Felder und bekommt dasselbe Verhalten.
 *
 * Die Reiter, die immer stehen, sind die, die jede Instanz hat: wer hier ist,
 * welche Rezepte sie anbietet, welche Rollen die Leute sich gegeben haben.
 */
interface AdminTab {
  value: string;
  label: string;
  title: string;
  description?: string;
  render: () => ReactNode;
}

function buildTabs(instanceId: typeof CURRENT_INSTANCE): AdminTab[] {
  const tabs: AdminTab[] = [
    {
      value: 'users',
      label: 'Nutzer:innen',
      title: 'Nutzer:innen',
      render: () => <UsersTab />,
    },
    {
      value: 'skills',
      label: 'Rezepte',
      title: 'Rezepte',
      description:
        'Welche Rezepte diese Instanz im Katalog anbietet. Ausgeblendete Rezepte bleiben über einen bestehenden Link oder eine explizite @-Erwähnung weiter erreichbar.',
      render: () => <SkillsTab />,
    },
    {
      value: 'agents',
      label: 'Agenten',
      title: 'Grünerator-Agenten',
      description:
        'Welche Agenten diese Instanz im Katalog anbietet. Ausgeblendete Agenten bleiben über einen bestehenden Link erreichbar. Die Landesverbands-Agenten stehen nicht einzeln hier — sie fallen mit ihrem Landesverband.',
      render: () => <AgentsTab />,
    },
    {
      value: 'roles',
      label: 'Rollen',
      title: 'Rollenübersicht',
      description: 'Welche Rolle sich die Nutzenden selbst gegeben haben.',
      render: () => <RolesTab />,
    },
  ];

  if (isToolOfferedIn('vorlagen', instanceId)) {
    tabs.push({
      value: 'vorlagen',
      label: 'Vorlagen',
      title: 'Vorlagen',
      description: 'Eingereichte Vorlagen prüfen und freigeben.',
      render: () => <VorlagenTab />,
    });
  }

  if (hasLandesverbandContentIn(instanceId)) {
    tabs.push({
      value: 'landesverbaende',
      label: 'Landesverbände',
      title: 'Landesverband-Admins',
      description: 'Lege fest, wer welchen Landesverband administrieren darf.',
      render: () => <LandesverbandAssignmentTab />,
    });
  }

  return tabs;
}

const AdminPage = () => {
  // Die Instanz steht beim Laden des Bundles fest — kein Memo nötig, und ein
  // Zustand wäre irreführend, weil sich der Reitersatz nie ändert.
  const tabs = buildTabs(CURRENT_INSTANCE);

  return (
    <RequireAdmin type="instanceAdmin">
      <ErrorBoundary>
        <PageContainer maxWidth="md">
          <div className="mb-lg pt-md">
            <h1 className="text-3xl font-semibold text-foreground-heading mb-xs">Administration</h1>
            <p className="text-lg text-grey-500 dark:text-grey-400 m-0">
              Nutzende, Rezepte und Rollen dieser Instanz.
            </p>
          </div>

          <Tabs defaultValue="users">
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {tabs.map((tab) => (
              <TabsContent key={tab.value} value={tab.value}>
                <SectionHeader title={tab.title} />
                {tab.description && (
                  <p className="text-sm text-grey-500 dark:text-grey-400 mb-md">
                    {tab.description}
                  </p>
                )}
                {tab.render()}
              </TabsContent>
            ))}
          </Tabs>
        </PageContainer>
      </ErrorBoundary>
    </RequireAdmin>
  );
};

export default withAuthRequired(AdminPage, {
  title: 'Administration',
});
