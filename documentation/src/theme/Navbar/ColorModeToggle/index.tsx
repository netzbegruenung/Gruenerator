import type { ReactNode } from 'react';

// The color mode lives in the footer as a hell/dunkel/system switcher
// (src/theme/Footer). This empties the navbar slot instead of using
// colorMode.disableSwitch, which would wipe the persisted choice on load.
export default function ColorModeToggle(): ReactNode {
  return null;
}
