import {
  type ExtractBelegResponse,
  type ReisekostenState,
  type VerpflegungAbzug,
} from '@gruenerator/contracts';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export function emptyState(): ReisekostenState {
  return {
    rateKey: 'de-DE/nrw',
    stammdaten: {
      name: '',
      strasse: '',
      hausnr: '',
      plz: '',
      ort: '',
      email: '',
      telefon: '',
      iban: '',
      bic: '',
    },
    reise: { anlass: '', ziel: '', reisebeginn: '', rueckkehr: '' },
    fahrt: { bahn: null, oepnv: null, kfz: null, miete: null, taxi: null, sonstiges: null },
    verpflegungAbzuege: [],
    uebernachtung: null,
    spende: 0,
  };
}

type Patch = (state: ReisekostenState) => ReisekostenState;

interface ReisekostenStore {
  step: number;
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  setStep: (step: number) => void;
  update: (patch: Patch) => void;
  setStammdaten: (patch: Partial<ReisekostenState['stammdaten']>) => void;
  setReise: (patch: Partial<ReisekostenState['reise']>) => void;
  setVerpflegungAbzug: (datum: string, patch: Partial<Omit<VerpflegungAbzug, 'datum'>>) => void;
  addBeleg: (beleg: ExtractBelegResponse) => void;
  removeBeleg: (index: number) => void;
  reset: () => void;
}

/** Persisted to localStorage — Stammdaten (incl. IBAN) never leave the device
 *  except in the explicit /pdf request. */
export const useReisekostenStore = create<ReisekostenStore>()(
  persist(
    (set) => ({
      step: 0,
      state: emptyState(),
      belege: [],
      setStep: (step) => set({ step }),
      update: (patch) => set((s) => ({ state: patch(s.state) })),
      setStammdaten: (patch) =>
        set((s) => ({ state: { ...s.state, stammdaten: { ...s.state.stammdaten, ...patch } } })),
      setReise: (patch) =>
        set((s) => ({ state: { ...s.state, reise: { ...s.state.reise, ...patch } } })),
      setVerpflegungAbzug: (datum, patch) =>
        set((s) => {
          const existing = s.state.verpflegungAbzuege.find((a) => a.datum === datum);
          const base: VerpflegungAbzug = existing ?? {
            datum,
            fruehstueck: false,
            mittagessen: false,
            abendessen: false,
          };
          const next = { ...base, ...patch };
          const abzuege = s.state.verpflegungAbzuege.filter((a) => a.datum !== datum);
          abzuege.push(next);
          return { state: { ...s.state, verpflegungAbzuege: abzuege } };
        }),
      addBeleg: (beleg) => set((s) => ({ belege: [...s.belege, beleg] })),
      removeBeleg: (index) => set((s) => ({ belege: s.belege.filter((_, i) => i !== index) })),
      reset: () => set({ step: 0, state: emptyState(), belege: [] }),
    }),
    {
      name: 'gruenerator-reisekosten',
      storage: createJSONStorage(() => localStorage),
      // Don't persist the transient wizard step or uploaded belege.
      partialize: (s) => ({ state: s.state }),
    },
  ),
);
