/**
 * Client for the letterhead catalogue (/api/auth/letterheads).
 *
 * Shared by the settings tab and the export dialog — the dialog's "für später
 * speichern" writes through exactly the same create call, so a letterhead saved
 * at the point of use is indistinguishable from one created in settings.
 */

import { getContractsClient, getGlobalApiClient } from '@gruenerator/shared/api';

import type { Letterhead, LetterheadDispatchMode } from '@gruenerator/contracts';

export type { Letterhead, LetterheadDispatchMode };

export interface LetterheadInput {
  label: string;
  organization?: string;
  address?: string;
  dispatch_mode?: LetterheadDispatchMode;
  show_return_line?: boolean;
  show_fold_marks?: boolean;
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

  /**
   * Briefpapier hochladen. Läuft über den rohen apiClient statt den
   * Contracts-Client: der Upload ist multipart, und der Contract beschreibt
   * JSON-Bodies. Der Server gibt den Dateinamen zurück, der danach in der
   * contract-typisierten Zeile steht.
   */
  async uploadStationery(id: string, file: File): Promise<string> {
    const form = new FormData();
    form.append('stationery', file);
    const res = await getGlobalApiClient().post<{ success: boolean; stationery_file: string }>(
      `/api/auth/letterheads/${id}/stationery`,
      form
    );
    return res.data.stationery_file;
  },

  async removeStationery(id: string): Promise<void> {
    await getGlobalApiClient().delete(`/api/auth/letterheads/${id}/stationery`);
  },
};

export const LETTERHEADS_QUERY_KEY = ['letterheads'] as const;

/** Shared by the settings tab, the export dialog and the tab's preload. */
export const letterheadsQuery = {
  queryKey: LETTERHEADS_QUERY_KEY,
  queryFn: letterheadApi.list,
  staleTime: 5 * 60 * 1000,
};
