/**
 * Client for the letterhead catalogue (/api/auth/letterheads).
 *
 * Shared by the settings tab and the export dialog — the dialog's "für später
 * speichern" writes through exactly the same create call, so a letterhead saved
 * at the point of use is indistinguishable from one created in settings.
 */

import { getContractsClient } from '@gruenerator/shared/api';

import type { Letterhead } from '@gruenerator/contracts';

export type { Letterhead };

export interface LetterheadInput {
  label: string;
  organization?: string;
  address?: string;
  is_default?: boolean;
}

export const letterheadApi = {
  async list(): Promise<Letterhead[]> {
    const res = await getContractsClient().letterheads.listLetterheads();
    if (res.status !== 200) throw new Error('Briefköpfe konnten nicht geladen werden.');
    return res.body.letterheads;
  },

  async create(input: LetterheadInput): Promise<Letterhead> {
    const res = await getContractsClient().letterheads.createLetterhead({ body: input });
    if (res.status !== 201) {
      throw new Error(
        (res.body as { message?: string })?.message ?? 'Briefkopf konnte nicht angelegt werden.'
      );
    }
    return res.body.letterhead;
  },

  async update(id: string, input: Partial<LetterheadInput>): Promise<Letterhead> {
    const res = await getContractsClient().letterheads.updateLetterhead({
      params: { id },
      body: input,
    });
    if (res.status !== 200) {
      throw new Error(
        (res.body as { message?: string })?.message ?? 'Briefkopf konnte nicht gespeichert werden.'
      );
    }
    return res.body.letterhead;
  },

  async remove(id: string): Promise<void> {
    const res = await getContractsClient().letterheads.deleteLetterhead({
      params: { id },
      body: {},
    });
    if (res.status !== 200) {
      throw new Error(
        (res.body as { message?: string })?.message ?? 'Briefkopf konnte nicht gelöscht werden.'
      );
    }
  },
};

export const LETTERHEADS_QUERY_KEY = ['letterheads'] as const;

/** Shared by the settings tab, the export dialog and the tab's preload. */
export const letterheadsQuery = {
  queryKey: LETTERHEADS_QUERY_KEY,
  queryFn: letterheadApi.list,
  staleTime: 5 * 60 * 1000,
};
