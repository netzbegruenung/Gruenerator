import { Suspense, lazy } from 'react';

import { useSettingsDialogStore } from './settingsDialogStore';

const SettingsDialog = lazy(() => import('./SettingsDialog'));

// Mounted once in App; loads the dialog chunk on first open and keeps it
// mounted afterwards so the Radix close animation can play.
const SettingsDialogHost = () => {
  const hasOpened = useSettingsDialogStore((s) => s.hasOpened);

  if (!hasOpened) return null;

  return (
    <Suspense fallback={null}>
      <SettingsDialog />
    </Suspense>
  );
};

export default SettingsDialogHost;
