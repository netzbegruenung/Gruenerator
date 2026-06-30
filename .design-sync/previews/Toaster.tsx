import { useEffect } from 'react';
import { Toaster, toast } from '@gruenerator/ui';

// Overlay component: sonner renders nothing until `toast()` is called, so we
// fire toasts on mount (the Toaster portals into document.body; the single-mode
// card with viewport captures the rendered surface). cfg.overrides.Toaster pins
// cardMode single + viewport (480x340). Position top-center so the expanded
// stack grows DOWNWARD and stays fully inside the short viewport (bottom-anchored
// stacks push the top toasts above the visible area). richColors gives each type
// its semantic tint; a long duration keeps them up for the capture.
export function Notifications() {
  useEffect(() => {
    toast.success('Pressemitteilung veröffentlicht', {
      description: 'Sichtbar auf der Website und im Presseverteiler.',
    });
    toast.error('Export fehlgeschlagen', {
      description: 'Das PDF konnte nicht erstellt werden.',
    });
    toast.info('Newsletter geplant', {
      description: 'Versand am 25. Juni an 4.812 Empfänger:innen.',
    });
  }, []);

  return (
    <Toaster
      position="top-center"
      richColors
      expand
      visibleToasts={3}
      duration={1000000}
    />
  );
}
