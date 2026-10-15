import { useLocalSearchParams } from 'expo-router';

import { AgentStartScreen } from '../../../../components/agentura/editor/AgentStartScreen';

/** „Neuer Agent"; `?mode=recurring` legt eine wiederkehrende Aufgabe an. */
export default function NewAgentRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return <AgentStartScreen variant={mode === 'recurring' ? 'recurring' : 'agent'} />;
}
