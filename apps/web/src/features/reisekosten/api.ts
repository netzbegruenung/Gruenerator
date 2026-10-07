import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { fileToBase64 } from '@gruenerator/shared/utils/fileToBase64';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  Abrechnung,
  AbrechnungUpdateBody,
  ExtractBelegResponse,
  FormularResponse,
  RateKey,
  ReisekostenServerState,
} from '@gruenerator/contracts';

const client = () => getContractsClient().reisekosten;

export async function extractBelegFromText(
  text: string,
  filename: string
): Promise<ExtractBelegResponse> {
  const res = await client().extractBeleg({ body: { text, filename } });
  if (res.status !== 200) throw new ApiError(res.status, 'Beleg konnte nicht ausgewertet werden');
  return res.body;
}

export async function extractBelegFromFile(file: File): Promise<ExtractBelegResponse> {
  const base64 = await fileToBase64(file);
  const res = await client().extractBeleg({
    body: { base64, filename: file.name, mimeType: file.type || 'application/octet-stream' },
  });
  if (res.status !== 200) throw new ApiError(res.status, 'Beleg konnte nicht ausgewertet werden');
  return res.body;
}

export const reisekostenKeys = {
  liste: ['reisekosten', 'abrechnungen'] as const,
  abrechnung: (idOrSlug: string) => ['reisekosten', 'abrechnung', idOrSlug] as const,
  formular: (rateKey: RateKey) => ['reisekosten', 'formular', rateKey] as const,
};

export function useAbrechnungen() {
  return useQuery({
    queryKey: reisekostenKeys.liste,
    queryFn: async () => {
      const res = await client().listAbrechnungen();
      if (res.status !== 200) throw new ApiError(res.status, 'Abrechnungen nicht geladen');
      return res.body.abrechnungen;
    },
  });
}

export function useAbrechnung(idOrSlug: string) {
  return useQuery({
    queryKey: reisekostenKeys.abrechnung(idOrSlug),
    queryFn: async () => {
      const res = await client().getAbrechnung({ params: { idOrSlug } });
      if (res.status !== 200) throw new ApiError(res.status, 'Abrechnung nicht gefunden');
      return res.body;
    },
    // The page edits a local copy and autosaves; a background refetch would
    // overwrite keystrokes that are still in the debounce window.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** The blank official form; it only changes with a deploy, so it is cached for the session. */
export function useFormular(rateKey: RateKey) {
  return useQuery({
    queryKey: reisekostenKeys.formular(rateKey),
    queryFn: async (): Promise<FormularResponse> => {
      const res = await client().formular({ query: { rateKey } });
      if (res.status !== 200) {
        throw new ApiError(res.status, 'Das Formular ist auf diesem Server nicht hinterlegt.');
      }
      return res.body;
    },
    staleTime: Infinity,
  });
}

export function useCreateAbrechnung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (state: ReisekostenServerState): Promise<Abrechnung> => {
      const res = await client().createAbrechnung({ body: { state } });
      if (res.status !== 201) throw new ApiError(res.status, 'Abrechnung nicht angelegt');
      return res.body;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: reisekostenKeys.liste }),
  });
}

export async function updateAbrechnung(
  idOrSlug: string,
  body: AbrechnungUpdateBody
): Promise<Abrechnung> {
  const res = await client().updateAbrechnung({ params: { idOrSlug }, body });
  if (res.status !== 200) throw new ApiError(res.status, 'Speichern fehlgeschlagen');
  return res.body;
}

export function useDeleteAbrechnung() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (idOrSlug: string) => {
      const res = await client().deleteAbrechnung({ params: { idOrSlug } });
      if (res.status !== 200) throw new ApiError(res.status, 'Löschen fehlgeschlagen');
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: reisekostenKeys.liste }),
  });
}
