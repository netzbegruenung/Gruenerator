import withAuthRequired from '../../components/common/LoginRequired/withAuthRequired';
import PageContainer from '../../components/common/PageContainer';
import ErrorBoundary from '../../components/ErrorBoundary';

import RequireAdmin from './components/RequireAdmin';
import { ConnectorTestView } from './connector-test/ConnectorTestView';

/**
 * `/admin/konnektoren` — Google und Microsoft über Nango verbinden und eine Datei
 * so lesen, wie `@connect` im Chat sie liest. Prüft immer die eigene Verbindung
 * der angemeldeten Admin-Person.
 */
const ConnectorTestPage = () => (
  <RequireAdmin type="instanceAdmin">
    <ErrorBoundary>
      <PageContainer maxWidth="lg">
        <div className="mb-lg pt-md">
          <h1 className="mb-xs text-3xl font-semibold text-foreground-heading">Konnektor-Test</h1>
          <p className="m-0 text-lg text-grey-500 dark:text-grey-400">
            Google Workspace und Microsoft 365 verbinden, Token prüfen und eine Datei über denselben
            Abruf lesen, den <code>@connect</code> im Chat nutzt.
          </p>
        </div>
        <ConnectorTestView />
      </PageContainer>
    </ErrorBoundary>
  </RequireAdmin>
);

export default withAuthRequired(ConnectorTestPage, {
  title: 'Konnektor-Test',
});
