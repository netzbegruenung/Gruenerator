/**
 * The part of a claim that never reaches the server: address, phone and bank
 * details. Kept per device in localStorage and prefilled into every new
 * Abrechnung; the official form gets them drawn in by the browser.
 */
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface PrivateStammdaten {
  strasse: string;
  hausnr: string;
  plz: string;
  ort: string;
  telefon: string;
  iban: string;
  bic: string;
}

/**
 * Placeholder bank details until a real solution exists — the well-known
 * Commerzbank test IBAN, valid by checksum and not anyone's account.
 */
export const MUSTER_IBAN = 'DE89 3704 0044 0532 0130 00';
export const MUSTER_BIC = 'COBADEFFXXX';

const EMPTY: PrivateStammdaten = {
  strasse: '',
  hausnr: '',
  plz: '',
  ort: '',
  telefon: '',
  iban: MUSTER_IBAN,
  bic: MUSTER_BIC,
};

interface PrivatStore {
  daten: PrivateStammdaten;
  setDaten: (patch: Partial<PrivateStammdaten>) => void;
}

export const usePrivatStore = create<PrivatStore>()(
  persist(
    (set) => ({
      daten: EMPTY,
      setDaten: (patch) => set((s) => ({ daten: { ...s.daten, ...patch } })),
    }),
    {
      name: 'gruenerator-reisekosten-privat',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => persisted as PrivatStore,
    }
  )
);

export function istMusterIban(iban: string): boolean {
  return iban.replace(/\s/g, '') === MUSTER_IBAN.replace(/\s/g, '');
}
