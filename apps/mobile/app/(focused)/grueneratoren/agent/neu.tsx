import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Alter Einstieg. Neue Agents gibt es nicht mehr: `?mode=recurring` (ältere
 * Links) geht zum Aufgaben-Editor, alles andere zum Rezept-Creator.
 */
export default function NewAgentRoute() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  if (mode === 'recurring') return <Redirect href="/(focused)/grueneratoren/aufgabe/neu" />;
  return <Redirect href="/(focused)/grueneratoren/rezept/neu" />;
}
