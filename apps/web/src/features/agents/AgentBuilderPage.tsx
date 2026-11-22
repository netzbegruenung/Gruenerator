import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Alter Einstieg (`/agents/new/manual`). Neue Agents gibt es nicht mehr; eine wiederkehrende
 * Aufgabe baut man im eigenen Editor, alles andere geht zum Rezept-Creator.
 */
function AgentBuilderPage() {
  const [searchParams] = useSearchParams();
  return (
    <Navigate
      to={searchParams.get('mode') === 'recurring' ? '/wiederkehrend/neu' : '/agentura/rezept/neu'}
      replace
    />
  );
}

export default AgentBuilderPage;
