/**
 * The editing state of one Abrechnung. The form works on the full claim; on
 * every change it is split again: address, phone and bank details go to the
 * device-local store, the rest is autosaved to the server. That split is the
 * privacy boundary on the client — the server schema enforces it once more.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { reisekostenKeys, updateAbrechnung } from '../api';
import { deleteBelegFile, saveBelegFile, vorhandeneBelegIds } from '../belege/belegFiles';
import { readBeleg } from '../belege/readBeleg';
import { usePrivatStore, type PrivateStammdaten } from '../privatStore';
import { syncBelege } from '../utils/syncBelege';

import type {
  Abrechnung,
  AbrechnungStatus,
  BelegMeta,
  ReisekostenServerState,
  ReisekostenState,
} from '@gruenerator/contracts';

const AUTOSAVE_MS = 800;

export type SaveStatus = 'gespeichert' | 'speichert' | 'fehler';

function merge(server: ReisekostenServerState, privat: PrivateStammdaten): ReisekostenState {
  return { ...server, stammdaten: { ...server.stammdaten, ...privat } };
}

function split(full: ReisekostenState): {
  server: ReisekostenServerState;
  privat: PrivateStammdaten;
} {
  const { name, funktion, email, wahlBeschlussVom, strasse, hausnr, plz, ort, telefon, iban, bic } =
    full.stammdaten;
  return {
    server: {
      ...full,
      stammdaten: {
        name,
        email,
        ...(funktion !== undefined ? { funktion } : {}),
        ...(wahlBeschlussVom !== undefined ? { wahlBeschlussVom } : {}),
      },
    },
    privat: { strasse, hausnr, plz, ort, telefon: telefon ?? '', iban, bic: bic ?? '' },
  };
}

export interface BelegUpload {
  id: string;
  dateiname: string;
  fehler?: string;
}

export function useAbrechnungEditor(abrechnung: Abrechnung) {
  const qc = useQueryClient();
  const privat = usePrivatStore((s) => s.daten);
  const setPrivat = usePrivatStore((s) => s.setDaten);

  const [server, setServer] = useState<ReisekostenServerState>(abrechnung.state);
  const [belege, setBelege] = useState<BelegMeta[]>(abrechnung.belege);
  const [status, setStatusState] = useState<AbrechnungStatus>(abrechnung.status);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('gespeichert');
  const [uploads, setUploads] = useState<BelegUpload[]>([]);
  const [lokaleDateien, setLokaleDateien] = useState<Set<string>>(new Set());

  const state = useMemo(() => merge(server, privat), [server, privat]);

  useEffect(() => {
    void vorhandeneBelegIds(abrechnung.id).then(setLokaleDateien);
  }, [abrechnung.id]);

  // Autosave: skip the first render (nothing changed yet), then debounce.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaveStatus('speichert');
    const t = setTimeout(() => {
      updateAbrechnung(abrechnung.id, { state: server, belege })
        .then((saved) => {
          qc.setQueryData(reisekostenKeys.abrechnung(abrechnung.slug), saved);
          void qc.invalidateQueries({ queryKey: reisekostenKeys.liste });
          setSaveStatus('gespeichert');
        })
        .catch(() => setSaveStatus('fehler'));
    }, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [server, belege, abrechnung.id, abrechnung.slug, qc]);

  // Async uploads finish after further edits; reading the latest state through
  // a ref keeps them from writing back a stale copy.
  const serverRef = useRef(server);
  const belegeRef = useRef(belege);
  const update = useCallback(
    (patch: (s: ReisekostenState) => ReisekostenState) => {
      const next = split(patch(merge(serverRef.current, usePrivatStore.getState().daten)));
      serverRef.current = next.server;
      setServer(next.server);
      setPrivat(next.privat);
    },
    [setPrivat]
  );

  const applyBelege = useCallback(
    (nextBelege: BelegMeta[], geaendert: BelegMeta[]) => {
      belegeRef.current = nextBelege;
      setBelege(nextBelege);
      update((s) => syncBelege(s, nextBelege, geaendert));
    },
    [update]
  );

  const addFiles = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        const uploadId = crypto.randomUUID();
        setUploads((u) => [...u, { id: uploadId, dateiname: file.name }]);
        try {
          const meta = await readBeleg(file);
          await saveBelegFile(abrechnung.id, meta.id, file);
          setLokaleDateien((s) => new Set(s).add(meta.id));
          applyBelege([...belegeRef.current, meta], [meta]);
          setUploads((u) => u.filter((x) => x.id !== uploadId));
        } catch {
          setUploads((u) =>
            u.map((x) => (x.id === uploadId ? { ...x, fehler: 'Konnte nicht gelesen werden' } : x))
          );
        }
      }
    },
    [abrechnung.id, applyBelege]
  );

  const updateBeleg = useCallback(
    (id: string, patch: Partial<BelegMeta>) => {
      const current = belegeRef.current;
      const before = current.find((b) => b.id === id);
      if (!before) return;
      const after = { ...before, ...patch };
      // A category change can move the beleg to another line; refill both.
      applyBelege(
        current.map((b) => (b.id === id ? after : b)),
        [before, after]
      );
    },
    [applyBelege]
  );

  const removeBeleg = useCallback(
    (id: string) => {
      const current = belegeRef.current;
      const removed = current.find((b) => b.id === id);
      void deleteBelegFile(abrechnung.id, id);
      applyBelege(
        current.filter((b) => b.id !== id),
        removed ? [removed] : []
      );
    },
    [abrechnung.id, applyBelege]
  );

  const replaceBelegFile = useCallback(
    async (id: string, file: File) => {
      await saveBelegFile(abrechnung.id, id, file);
      setLokaleDateien((s) => new Set(s).add(id));
    },
    [abrechnung.id]
  );

  const dismissUpload = useCallback(
    (id: string) => setUploads((u) => u.filter((x) => x.id !== id)),
    []
  );

  const setStatus = useCallback(
    async (next: AbrechnungStatus) => {
      setStatusState(next);
      const saved = await updateAbrechnung(abrechnung.id, { status: next });
      qc.setQueryData(reisekostenKeys.abrechnung(abrechnung.slug), saved);
      void qc.invalidateQueries({ queryKey: reisekostenKeys.liste });
    },
    [abrechnung.id, abrechnung.slug, qc]
  );

  return {
    state,
    update,
    belege,
    uploads,
    lokaleDateien,
    addFiles,
    updateBeleg,
    removeBeleg,
    replaceBelegFile,
    dismissUpload,
    status,
    setStatus,
    saveStatus,
  };
}
