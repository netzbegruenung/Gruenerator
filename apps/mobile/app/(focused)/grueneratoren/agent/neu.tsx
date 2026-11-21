import { Redirect, useLocalSearchParams } from 'expo-router';

import { AgentStartScreen } from '../../../../components/agentura/editor/AgentStartScreen';

/**
 * Nur noch `?mode=recurring`: eine wiederkehrende Aufgabe legt ihren Agent
 * vorerst weiter selbst an. Neue Agents gibt es nicht mehr — ohne den Modus
 * geht es zum Rezept-Creator.
 */
export default function NewAgentRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  if (mode !== 'recurring') return <Redirect href="/(focused)/grueneratoren/rezept/neu" />;
  return <AgentStartScreen variant="recurring" />;
}
