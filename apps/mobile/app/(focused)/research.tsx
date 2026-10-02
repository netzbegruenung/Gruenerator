import { Redirect } from 'expo-router';

import { route } from '../../types/routes';

/**
 * The old Websuche screen. Research lives in Wissen now (#4025).
 * This path stays forever: shipped binaries and links may still open it.
 */
export default function LegacyResearchRoute() {
  return <Redirect href={route('/(focused)/wissen')} />;
}
