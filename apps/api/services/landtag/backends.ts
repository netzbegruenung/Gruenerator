/**
 * Die Abrufe je Parlament hinter einer gemeinsamen Schnittstelle. Eintrag je
 * Parlament; der Compiler verlangt ihn, sobald der Contract ein Parlament kennt.
 */
import {
  type BundestagCandidate,
  type LandtagFilter,
  type LandtagParlament,
} from '@gruenerator/contracts';

import { type FetchedDoc, type TextCache } from '../bundestag/qa/fetchTexts.js';

import { findBerlin, type LandtagFindResult } from './berlin/find.js';
import { getPardok } from './berlin/pardokLive.js';
import { resolveBerlinRefs } from './berlin/refs.js';
import { fetchBerlinTexts } from './berlin/text.js';
import { getNationalratApi } from './nationalrat/filterApi.js';
import { findNationalrat } from './nationalrat/find.js';
import { resolveNationalratRefs } from './nationalrat/refs.js';
import { type Deadline } from '../../utils/deadline.js';
import { fetchNationalratTexts } from './nationalrat/text.js';
import { findNrw } from './nrw/find.js';
import { getNrwNotebook } from './nrw/notebook.js';
import { fetchNrwTexts, resolveNrwRefs } from './nrw/read.js';

export interface LandtagBackend {
  find(args: {
    query: string;
    filters: LandtagFilter;
    deadline?: Deadline | null;
  }): Promise<LandtagFindResult>;
  /** Unbekannte Refs fallen weg. */
  resolveRefs(refs: readonly string[]): Promise<BundestagCandidate[]>;
  fetchTexts(
    candidates: readonly BundestagCandidate[],
    deps: { redis: TextCache | null; signal: AbortSignal }
  ): Promise<FetchedDoc[]>;
}

export const LANDTAG_BACKENDS: Record<LandtagParlament, () => LandtagBackend> = {
  berlin: () => ({
    find: (args) => findBerlin(args, getPardok()),
    resolveRefs: (refs) => resolveBerlinRefs(refs, getPardok()),
    fetchTexts: fetchBerlinTexts,
  }),
  nationalrat: () => ({
    find: (args) => findNationalrat(args, getNationalratApi()),
    resolveRefs: (refs) => resolveNationalratRefs(refs, getNationalratApi()),
    fetchTexts: (candidates, deps) => fetchNationalratTexts(candidates, deps, getNationalratApi()),
  }),
  // Keine Live-API: alles aus dem Notebook (`nrw/notebook.ts`).
  nrw: () => ({
    find: (args) => findNrw(args, getNrwNotebook()),
    resolveRefs: (refs) => resolveNrwRefs(refs, getNrwNotebook()),
    fetchTexts: (candidates) => fetchNrwTexts(candidates, getNrwNotebook()),
  }),
};
