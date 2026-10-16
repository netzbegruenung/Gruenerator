/**
 * Export warning for the poster's V.i.S.d.P. / Impressum. Every poster page is a
 * printed poster of its own, so every page should carry a filled-in line
 * (composePrint puts it on the first; added pages need it too). The editor
 * feeds this hook each page's own state, keyed by page id. Until every page has
 * reported, the gate is `ready: false` and stays silent; it never blocks the PDF.
 */
import { type PrintFormatId } from '@gruenerator/contracts';
import { useMemo } from 'react';

import { composePrintImpressum, PRINT_IMPRESSUM_ID } from '../../../composer/composePrint';
import {
  impressumLine,
  isImpressumComplete,
  parseImpressumLine,
  type ImpressumLocale,
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

export function impressumLocaleOf(page: GatePage | null): ImpressumLocale {
  return page?.configId === 'freeform-at' ? 'de-AT' : 'de-DE';
}

/** Posters are the one-sided print formats (a static format flag); cards are two-sided. */
export function isPosterFormat(format: PrintCanvasFormat | null): format is PrintCanvasFormat {
  return format !== null && format.print.seiten === 1;
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
    if (!isPosterFormat(format)) return null;
    const locale = impressumLocaleOf(pages[0] ?? null);
    const reports = pages.map((page) => observed[page.id]);
    if (pages.length === 0 || reports.some((r) => r === undefined)) {
      return { ready: false, locale, text: null, onSubmit: () => {} };
    }
    const reported = pages.map((page, i) => ({ page, report: reports[i] as ObservedPageState }));
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
