import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * Alter Einstieg (`/agents/new`). Neue Agents gibt es nicht mehr; eine wiederkehrende
 * Aufgabe baut man im eigenen Editor, alles andere geht zum Rezept-Creator.
 */
function AgentCreatorPage() {
  const [searchParams] = useSearchParams();
  return (
    <Navigate
      to={searchParams.get('mode') === 'recurring' ? '/wiederkehrend/neu' : '/agentura/rezept/neu'}
      replace
    />
  );
}

export default AgentCreatorPage;
