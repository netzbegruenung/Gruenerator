/**
 * Export warning for the V.i.S.d.P. / Impressum. The format says which pages
 * carry it: every poster page is a printed poster of its own, so each needs a
 * filled-in line (composePrint puts it on the first; added pages need it
 * too); a flyer carries it once, on its first or last page. The editor
 * feeds this hook each page's own state, keyed by page id. Until every page has
 * reported, the gate is `ready: false` and stays silent; it never blocks the PDF.
 */
import { type PrintFormatId } from '@gruenerator/contracts';
import { useMemo } from 'react';

import { composePrintImpressum, PRINT_IMPRESSUM_ID } from '../../../composer/composePrint';
import {
  impressumLine,
  impressumLocaleOf,
  isImpressumComplete,
  parseImpressumLine,
} from '../../../composer/printImpressum';
import { type PrintCanvasFormat } from '../../../formats';
import { type PrintImpressumGate } from '../../TopBar/DownloadSection';

import type { AdditionalText } from '../../../configs/types';

/** The freeform page actions the gate writes through. */
interface FreeformImpressumActions {
  updateAdditionalText?: (id: string, partial: Partial<AdditionalText>) => void;
  addAdditionalTextElement?: (text: AdditionalText) => void;
}

/** What a page last reported. */
export interface ObservedPageState {
  pageId: string;
  state: Record<string, unknown>;
  actions: Record<string, unknown>;
}

/** The latest report per page id; reports from removed pages are ignored. */
export type ObservedPages = Readonly<Record<string, ObservedPageState>>;

export interface GatePage {
  id: string;
  configId: string;
}

/** Formats that carry a V.i.S.d.P. / Impressum: posters, flyers, the newspaper — not cards or letterheads. */
export function needsImpressum(format: PrintCanvasFormat | null): format is PrintCanvasFormat {
  return format !== null && format.print.impressum !== null;
}

/** The pages that must carry the line. */
function impressumPages(format: PrintCanvasFormat, pages: GatePage[]): GatePage[] {
  if (format.print.impressum === 'erste-seite') return pages.slice(0, 1);
  if (format.print.impressum === 'letzte-seite') return pages.slice(-1);
  return pages;
}

function impressumElementOf(observed: ObservedPageState): AdditionalText | null {
  const texts = observed.state.additionalTexts;
  if (!Array.isArray(texts)) return null;
  return (texts as AdditionalText[]).find((t) => t.id === PRINT_IMPRESSUM_ID) ?? null;
}

function pageComplete(page: GatePage, observed: ObservedPageState): boolean {
  const element = impressumElementOf(observed);
  return isImpressumComplete(parseImpressumLine(impressumLocaleOf(page), element?.text ?? ''));
}

export function usePrintImpressumGate(
  format: PrintCanvasFormat | null,
  pages: GatePage[],
  observed: ObservedPages
): PrintImpressumGate | null {
  return useMemo(() => {
    if (!needsImpressum(format)) return null;
    const locale = impressumLocaleOf(pages[0] ?? null);
    const scope = impressumPages(format, pages);
    const reports = scope.map((page) => observed[page.id]);
    if (scope.length === 0 || reports.some((r) => r === undefined)) {
      return { ready: false, locale, text: null, onSubmit: () => {} };
    }
    const reported = scope.map((page, i) => ({ page, report: reports[i] as ObservedPageState }));
    // The form shows the first incomplete page's line, else page 1's.
    const shown = reported.find(({ page, report }) => !pageComplete(page, report)) ?? reported[0];
    const shownElement = shown ? impressumElementOf(shown.report) : null;
    return {
      ready: true,
      locale,
      text: shownElement ? shownElement.text : null,
      onSubmit: (parts) => {
        for (const { page, report } of reported) {
          const pageLocale = impressumLocaleOf(page);
          const text = impressumLine(pageLocale, parts);
          const actions = report.actions as FreeformImpressumActions;
          if (impressumElementOf(report)) {
            actions.updateAdditionalText?.(PRINT_IMPRESSUM_ID, { text });
          } else {
            actions.addAdditionalTextElement?.(
              composePrintImpressum(format.id as PrintFormatId, pageLocale === 'de-AT', text)
            );
          }
        }
      },
    };
  }, [format, pages, observed]);
}
