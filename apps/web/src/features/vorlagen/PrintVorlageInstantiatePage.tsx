import { CanvasEditorSkeleton } from '@gruenerator/canvas-editor/skeleton';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState, type JSX } from 'react';
import { Link, useParams } from 'react-router-dom';

import { hasNativeEditorBar } from '../../hooks/useNativeEditorBar';

import { usePrintVorlage } from './hooks/usePrintVorlage';
import { printVorlagenQuery } from './hooks/useSharepicVorlagen';

/**
 * `/studio/druck/:id` — copies a print Vorlage (business card, poster) into a
 * new canvas of the viewer's own and opens it in the editor. The collection
 * launchpad links here; the gallery's „Verwenden" does the same through
 * `usePrintVorlage`.
 */
export default function PrintVorlageInstantiatePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const catalog = useQuery(printVorlagenQuery());
  const { openPrintVorlage } = usePrintVorlage();
  const [failed, setFailed] = useState(false);
  // StrictMode runs effects twice; one Vorlage, one copy.
  const started = useRef(false);

  const vorlage = catalog.data?.find((v) => v.id === id) ?? null;

  useEffect(() => {
    if (!vorlage || started.current) return;
    started.current = true;
    void openPrintVorlage(vorlage).then((opened) => setFailed(!opened));
  }, [vorlage, openPrintVorlage]);

  const missing = catalog.isSuccess && vorlage === null;
  if (!missing && !catalog.isError && !failed) {
    return <CanvasEditorSkeleton topBar={!hasNativeEditorBar()} />;
  }

  return (
    <div className="mx-auto flex max-w-[28rem] flex-col items-center gap-4 px-md py-16 text-center">
      <p className="text-lg font-semibold text-foreground-heading">Vorlage nicht geöffnet</p>
      <p className="text-sm text-foreground">
        {missing ? 'Diese Vorlage gibt es nicht (mehr).' : 'Die Vorlage ließ sich nicht öffnen.'}
      </p>
      <Link to="/vorlagen" className="text-sm font-semibold text-foreground-heading underline">
        Zu den Vorlagen
      </Link>
    </div>
  );
}
