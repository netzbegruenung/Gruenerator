import { SectionHeader } from '@gruenerator/ui';

import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import RequireAdmin from './components/RequireAdmin';
import SkillsTab from './tabs/SkillsTab';

/**
 * `/admin/skills` als eigener Einstieg — derselbe Reiter wie unter `/admin`,
 * nur direkt verlinkbar. Die URL ist älter als der zusammengelegte
 * Administrationsbereich und bleibt deshalb stehen.
 */
const AdminSkillsPage = () => (
  <RequireAdmin type="instanceAdmin">
    <ErrorBoundary>
      <PageContainer maxWidth="md">
        <div className="mb-lg pt-md">
          <h1 className="text-3xl font-semibold text-foreground-heading mb-xs">Rezepte</h1>
          <p className="text-lg text-grey-500 dark:text-grey-400 m-0">
            Welche Rezepte diese Instanz im Katalog anbietet. Ausgeblendete Rezepte bleiben über
            einen bestehenden Link oder eine explizite @-Erwähnung weiter erreichbar.
          </p>
        </div>
        <SectionHeader title="Rezepte-Sichtbarkeit" />
        <SkillsTab />
      </PageContainer>
    </ErrorBoundary>
  </RequireAdmin>
);

export default withAuthRequired(AdminSkillsPage, {
  title: 'Rezepte verwalten',
});
