import { DismissableBanner } from '@gruenerator/ui';

/** Shared dismiss key so the warning stays hidden across the creator entry
 *  (AgentStartScreen) and the editor (AgentEditor) once dismissed. */
export const AGENT_CREATOR_EXPERIMENTAL_KEY = 'agent-creator-experimental-warning';

/**
 * Experimental-feature notice shown on every surface where users build their
 * own agents. The creator is public but still in active development, so this
 * sets expectations and points people at the team for bug reports.
 */
export function ExperimentalAgentBanner({ className }: { className?: string }) {
  return (
    <DismissableBanner
      storageKey={AGENT_CREATOR_EXPERIMENTAL_KEY}
      variant="warning"
      className={className}
    >
      <strong>Experimentelles Feature</strong> — Eigene Agent*innen sind noch in der Erprobung.
      Verhalten und Funktionen können sich ändern, und nicht alles funktioniert schon zuverlässig.
      Bitte melde Probleme dem Team.
    </DismissableBanner>
  );
}
