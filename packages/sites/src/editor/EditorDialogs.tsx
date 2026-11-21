import { Dialog, DialogContent, DialogTitle } from '@gruenerator/ui';

import { LegalPanel } from '../components/editor/legal/LegalPanel';
import { SettingsPanel } from '../components/editor/settings/SettingsPanel';
import { useEditorStore } from '../stores/editorStore';

/** Address, colours and visible sections, and the Impressum: the parts that are not on the page. */
export function EditorDialogs() {
  const dialog = useEditorStore((s) => s.dialog);
  const openDialog = useEditorStore((s) => s.openDialog);
  return (
    <Dialog
      open={dialog !== null}
      onOpenChange={(open) => {
        if (!open) openDialog(null);
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="section-editor-panel max-h-[85dvh] w-[min(560px,calc(100vw-2rem))] max-w-none overflow-y-auto"
      >
        <DialogTitle className="sr-only">
          {dialog === 'legal' ? 'Impressum' : 'Einstellungen'}
        </DialogTitle>
        {dialog === 'legal' ? <LegalPanel /> : dialog === 'settings' ? <SettingsPanel /> : null}
      </DialogContent>
    </Dialog>
  );
}
