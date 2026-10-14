import { slugifyName } from '@gruenerator/shared/utils';
import { Button, toast } from '@gruenerator/ui';
import { FiDownload } from 'react-icons/fi';

import { downloadFile } from '../../../utils/downloadFile';
import { whiteboardToExcalidrawFile } from '../utils/whiteboardExport';

import type { Doc } from 'yjs';

interface WhiteboardUnavailableProps {
  ydoc: Doc;
  isSynced: boolean;
  title: string;
}

/** Stands in for the removed Excalidraw editor; the drawing stays stored and downloadable. */
export function WhiteboardUnavailable({ ydoc, isSynced, title }: WhiteboardUnavailableProps) {
  const handleDownload = () => {
    const { json, elementCount } = whiteboardToExcalidrawFile(ydoc);
    if (elementCount === 0) {
      toast.info('Dieses Whiteboard ist leer.');
      return;
    }
    void downloadFile(json, `${slugifyName(title, 'whiteboard')}.excalidraw`, 'application/json');
  };

  return (
    <div className="flex-1 flex items-center justify-center px-md">
      <div className="flex max-w-md flex-col items-center gap-md text-center">
        <h2 className="m-0 text-lg font-semibold text-foreground-heading">
          Whiteboards sind vorübergehend nicht verfügbar
        </h2>
        <p className="m-0 text-sm text-grey-500 dark:text-grey-300">
          Wir haben den Whiteboard-Editor vorerst entfernt. Deine Zeichnung ist weiter gespeichert.
          Du kannst sie als <code>.excalidraw</code>-Datei herunterladen und zum Beispiel auf
          excalidraw.com öffnen.
        </p>
        <Button onClick={handleDownload} disabled={!isSynced}>
          <FiDownload />
          {isSynced ? 'Whiteboard herunterladen' : 'Wird geladen…'}
        </Button>
      </div>
    </div>
  );
}
