import { Alert, AlertDescription, Button, Input } from '@gruenerator/ui';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { type ImportProgress, runParteitagImport, type SelectedFile } from './parteitagImport';

/**
 * „Parteitag importieren“: den Export-Ordner von `export_manifest.py` wählen (manifest.json,
 * reels/, posters/), Passwort setzen oder offen lassen, hochladen. Läuft über die Sitzung der
 * Admin-Person; ein abgebrochener Lauf setzt beim nächsten Versuch an derselben Stelle fort.
 */
function progressText(p: ImportProgress): string {
  switch (p.phase) {
    case 'checking':
      return 'Ordner wird geprüft …';
    case 'uploading':
      return `Datei ${p.done + 1} von ${p.total}: ${p.fileName} (${p.percent} %)`;
    case 'importing':
      return 'Reden werden angelegt …';
    case 'waiting':
      return 'Der Server arbeitet noch, das kann einige Minuten dauern …';
  }
}

export function ParteitagImportPanel() {
  const queryClient = useQueryClient();
  const folderId = useId();
  const passwordId = useId();
  const openId = useId();
  const [selected, setSelected] = useState<SelectedFile[]>([]);
  const [password, setPassword] = useState('');
  const [noPassword, setNoPassword] = useState(false);
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const running = progress !== null;

  // Leaving the page stops the upload; the next run resumes, but say so before it happens.
  useEffect(() => {
    if (!running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [running]);

  const start = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setDone(null);
    try {
      const result = await runParteitagImport({
        selected,
        password: noPassword ? null : password,
        onProgress: setProgress,
        signal: controller.signal,
      });
      setDone(
        `Importiert: ${result.speechCount} Reden, ${result.uploaded} Dateien hochgeladen, ` +
          `${result.skipped} schon vorhanden.`
      );
      setPassword('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'parteitage'] }),
        queryClient.invalidateQueries({ queryKey: ['parteitage'] }),
      ]);
    } catch (e) {
      if (controller.signal.aborted) setError('Abgebrochen. Ein neuer Start setzt dort fort.');
      else setError(e instanceof Error ? e.message : 'Der Import ist fehlgeschlagen.');
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const canStart = selected.length > 0 && (noPassword || password.length > 0) && !running;

  return (
    <section
      aria-labelledby={`${folderId}-title`}
      className="flex flex-col gap-md rounded-md border p-md"
    >
      <h3 id={`${folderId}-title`} className="text-base font-semibold">
        Parteitag importieren
      </h3>
      <p className="text-sm text-muted-foreground">
        Den Export-Ordner wählen (mit manifest.json, reels/ und posters/). Schon vorhandene Dateien
        werden übersprungen; ein erneuter Import aktualisiert den Parteitag.
      </p>

      <div className="flex flex-col gap-xs">
        <label htmlFor={folderId} className="text-sm">
          Export-Ordner
        </label>
        <input
          id={folderId}
          type="file"
          multiple
          disabled={running}
          // Not in React's input typings; lets the picker choose a whole folder.
          ref={(el) => el?.setAttribute('webkitdirectory', '')}
          className="text-sm"
          onChange={(e) =>
            setSelected(
              Array.from(e.target.files ?? []).map((file) => ({
                path: file.webkitRelativePath || file.name,
                file,
              }))
            )
          }
        />
        {selected.length > 0 && (
          <span className="text-sm text-muted-foreground">{selected.length} Dateien gewählt</span>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-sm">
        <div className="flex flex-col gap-xs">
          <label htmlFor={passwordId} className="text-sm">
            Passwort
          </label>
          <Input
            id={passwordId}
            type="password"
            autoComplete="new-password"
            disabled={noPassword || running}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <label htmlFor={openId} className="flex items-center gap-xs text-sm">
          <input
            id={openId}
            type="checkbox"
            checked={noPassword}
            disabled={running}
            onChange={(e) => setNoPassword(e.target.checked)}
          />
          Ohne Passwort (offen für alle Eingeloggten)
        </label>
      </div>

      <div className="flex flex-wrap gap-sm">
        <Button disabled={!canStart} onClick={() => void start()}>
          Importieren
        </Button>
        {running && (
          <Button variant="outline" onClick={() => abortRef.current?.abort()}>
            Abbrechen
          </Button>
        )}
      </div>

      <p role="status" aria-live="polite" className="text-sm">
        {progress ? progressText(progress) : (done ?? '')}
      </p>
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </section>
  );
}
