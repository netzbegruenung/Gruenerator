import {
  type CanvasVorlage,
  type FolienVorlage,
  type PrintVorlage,
  type SharepicCreatorLocale,
  type SharepicBlock,
  type SharepicBrand,
  type SharepicSeite,
  type SharepicVorlage,
} from '@gruenerator/contracts';
import { ApiError, getContractsClient } from '@gruenerator/shared/api';
import { queryOptions, useQuery } from '@tanstack/react-query';

/**
 * The Grünerator-Vorlagen for sharepics of the viewer's country — the server
 * detects it. `land` asks for the other country; the server honours it for
 * instance admins only. The catalogue changes with a deploy, not while
 * someone browses. Shared by the gallery and the canvas editor's „Vorlagen" tab.
 */
export const sharepicVorlagenQuery = (land: SharepicCreatorLocale | null = null) =>
  queryOptions({
    queryKey: ['sharepic-vorlagen', land],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SharepicVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.list({
        query: land ? { land } : {},
      });
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          `Vorlagen konnten nicht geladen werden (HTTP ${res.status}).`
        );
      }
      return res.body.vorlagen;
    },
  });

export function useSharepicVorlagen(land: SharepicCreatorLocale | null = null) {
  return useQuery(sharepicVorlagenQuery(land));
}

/** The single Seiten of the viewer's country in one design, for the editor's „Vorlagen" tab. */
export const sharepicSeitenQuery = (brand: SharepicBrand) =>
  queryOptions({
    queryKey: ['sharepic-seiten', brand],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SharepicSeite[]> => {
      const res = await getContractsClient().sharepicVorlagen.seiten({ query: { brand } });
      if (res.status !== 200) {
        throw new ApiError(res.status, `Seiten konnten nicht geladen werden (HTTP ${res.status}).`);
      }
      return res.body.seiten;
    },
  });

/** The Grünerator-Blöcke of the viewer's country in one design, for the editor's Elemente panel. */
export const sharepicBloeckeQuery = (brand: SharepicBrand) =>
  queryOptions({
    queryKey: ['sharepic-bloecke', brand],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<SharepicBlock[]> => {
      const res = await getContractsClient().sharepicVorlagen.bloecke({ query: { brand } });
      if (res.status !== 200) {
        throw new ApiError(res.status, `Blöcke konnten nicht geladen werden (HTTP ${res.status}).`);
      }
      return res.body.bloecke;
    },
  });

/** Vorlagen stored as finished canvas pages, for every format; the editor filters by its own. */
export const canvasVorlagenQuery = () =>
  queryOptions({
    queryKey: ['canvas-vorlagen'],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<CanvasVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.canvas({ query: {} });
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          `Vorlagen konnten nicht geladen werden (HTTP ${res.status}).`
        );
      }
      return res.body.vorlagen;
    },
  });

/** The print Vorlagen of the viewer's country; `land` like `sharepicVorlagenQuery`. */
export const printVorlagenQuery = (land: SharepicCreatorLocale | null = null) =>
  queryOptions({
    queryKey: ['print-vorlagen', land],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<PrintVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.print({
        query: land ? { land } : {},
      });
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          `Vorlagen konnten nicht geladen werden (HTTP ${res.status}).`
        );
      }
      return res.body.vorlagen;
    },
  });

/** The slide deck styles of the viewer's country, for the editor's „Vorlage für alle Folien". */
export const folienVorlagenQuery = (land: SharepicCreatorLocale | null = null) =>
  queryOptions({
    queryKey: ['folien-vorlagen', land],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<FolienVorlage[]> => {
      const res = await getContractsClient().sharepicVorlagen.folien({
        query: land ? { land } : {},
      });
      if (res.status !== 200) {
        throw new ApiError(
          res.status,
          `Vorlagen konnten nicht geladen werden (HTTP ${res.status}).`
        );
      }
      return res.body.vorlagen;
    },
  });
