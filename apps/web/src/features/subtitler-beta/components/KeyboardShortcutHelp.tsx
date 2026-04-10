import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@gruenerator/ui';

interface KeyboardShortcutHelpProps {
  isOpen: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['Space', 'K'], description: 'Abspielen / Pause' },
  { keys: ['J'], description: '5 Sekunden zurück' },
  { keys: ['L'], description: '5 Sekunden vor' },
  { keys: ['←'], description: '1 Sekunde zurück' },
  { keys: ['→'], description: '1 Sekunde vor' },
  { keys: ['Ctrl', 'Z'], description: 'Rückgängig' },
  { keys: ['Ctrl', 'Shift', 'Z'], description: 'Wiederherstellen' },
  { keys: ['Ctrl', 'F'], description: 'Suchen & Ersetzen' },
  { keys: ['Ctrl', 'S'], description: 'Projekt speichern' },
  { keys: ['?'], description: 'Tastenkürzel anzeigen' },
] as const;

export function KeyboardShortcutHelp({ isOpen, onClose }: KeyboardShortcutHelpProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[24rem]">
        <DialogHeader>
          <DialogTitle>Tastenkürzel</DialogTitle>
        </DialogHeader>
        <div className="space-y-xs">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.description} className="flex items-center justify-between py-xs">
              <span className="text-sm text-grey-600 dark:text-grey-400">
                {shortcut.description}
              </span>
              <div className="flex items-center gap-0.5">
                {shortcut.keys.map((key, i) => (
                  <span key={i}>
                    {i > 0 && <span className="mx-0.5 text-xs text-grey-400">+</span>}
                    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border border-grey-200 bg-grey-50 px-1.5 text-xs font-medium text-grey-700 dark:border-grey-700 dark:bg-grey-800 dark:text-grey-300">
                      {key}
                    </kbd>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
