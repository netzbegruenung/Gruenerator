import { agenturaToMarketplaceHref } from '@gruenerator/shared/marketplace';
import { Navigate, useSearchParams } from 'react-router-dom';

/**
 * `/agentura` — bis Oktober 2026 der Shop, heute der Marktplatz. Links aus
 * Chat-Antworten, Menüs und Lesezeichen leben weiter (URL-Sonderrecht): ein
 * Shop-Link landet auf `/marktplatz` mit derselben Art, Herkunft und Suche,
 * ein Link, der die frühere Übersicht meinte, auf `/grueneratoren`.
 */
export default function AgenturaPage() {
  const [params] = useSearchParams();
  return <Navigate to={agenturaToMarketplaceHref(params)} replace />;
}
