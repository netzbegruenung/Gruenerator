import { EMPTY_FORM } from '@gruenerator/shared/grueneratoren';
import { Navigate, useSearchParams } from 'react-router-dom';

import AgentEditor from './AgentEditor';

import { useDocumentTitle } from '@/components/hooks/useDocumentTitle';
import { useAuthStore } from '@/stores/authStore';

/**
 * Route wrapper for the manual create entry point (`/agents/new/manual`). Opens
 * the single-page {@link AgentEditor} with an empty form. `?mode=recurring`
 * surfaces the Zeitplan tab so the same builder creates a scheduled agent.
 *
 * Neue Agents gibt es nicht mehr: ohne `?mode=recurring` geht es zum
 * Rezept-Creator. Wiederkehrende Aufgaben legen ihren Agent vorerst weiter an.
 */
function AgentBuilderPage() {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get('mode') === 'recurring' ? 'recurring' : 'agent';
  // Das Land des Formulars wird zur Sprache der Aufgabe bzw. Zielgruppe des
  // Agents — ein fester de-DE-Start ließ AT-Aufgaben deutsch laufen.
  const locale = useAuthStore((s) => s.locale);

  useDocumentTitle(variant === 'recurring' ? 'Neuer wiederkehrender Agent' : 'Neuer Agent');

  if (variant !== 'recurring') return <Navigate to="/agentura/rezept/neu" replace />;
  return <AgentEditor mode="create" initialState={{ ...EMPTY_FORM, locale }} variant={variant} />;
}

export default AgentBuilderPage;
