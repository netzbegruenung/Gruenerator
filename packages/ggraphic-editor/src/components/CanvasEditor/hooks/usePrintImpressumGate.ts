// SPDX-License-Identifier: MPL-2.0
/**
 * Export warning for the V.i.S.d.P. / Impressum. The format says which pages
 * carry it: every poster page is a printed poster of its own, so each needs a
 * filled-in line (composePrint puts it on the first; added pages need it
 * too); a flyer carries it once, on its first or last page. The editor
 * feeds this hook each page's own state, keyed by page id. Until every page has
 * reported, the gate is `ready: false` and stays silent; it never blocks the PDF.
 * What the line is and when it counts as filled in comes from the host
 * (`CanvasEditorServices.print`); without it there is no gate.
 */
import { useCanvasEditorServices } from '@ggraphic/editor/CanvasEditorProvider';
import { type PrintCanvasFormat } from '@ggraphic/editor/formats/index';
import { useMemo } from 'react';

import { type PrintImpressumGate } from '../../TopBar/DownloadSection';

import type { AdditionalText } from '@ggraphic/editor/configs/types';
import type { CanvasImpressumService } from '@ggraphic/editor/hostServices';

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

function impressumElementOf(
  impressum: CanvasImpressumService,
  observed: ObservedPageState
): AdditionalText | null {
  const texts = observed.state.additionalTexts;
  if (!Array.isArray(texts)) return null;
  return (texts as AdditionalText[]).find((t) => t.id === impressum.elementId) ?? null;
}

function pageComplete(
  impressum: CanvasImpressumService,
  page: GatePage,
  observed: ObservedPageState
): boolean {
  const element = impressumElementOf(impressum, observed);
  return impressum.isComplete(impressum.parse(impressum.localeOf(page), element?.text ?? ''));
}

export function usePrintImpressumGate(
  format: PrintCanvasFormat | null,
  pages: GatePage[],
  observed: ObservedPages
): PrintImpressumGate | null {
  const impressum = useCanvasEditorServices().print?.impressum;
  return useMemo(() => {
    if (!impressum || !needsImpressum(format)) return null;
    const locale = impressum.localeOf(pages[0] ?? null);
    const scope = impressumPages(format, pages);
    const reports = scope.map((page) => observed[page.id]);
    if (scope.length === 0 || reports.some((r) => r === undefined)) {
      return { ready: false, locale, text: null, onSubmit: () => {} };
    }
    const reported = scope.map((page, i) => ({ page, report: reports[i] as ObservedPageState }));
    // The form shows the first incomplete page's line, else page 1's.
    const shown =
      reported.find(({ page, report }) => !pageComplete(impressum, page, report)) ?? reported[0];
    const shownElement = shown ? impressumElementOf(impressum, shown.report) : null;
    return {
      ready: true,
      locale,
      text: shownElement ? shownElement.text : null,
      onSubmit: (parts) => {
        for (const { page, report } of reported) {
          const pageLocale = impressum.localeOf(page);
          const text = impressum.line(pageLocale, parts);
          const actions = report.actions as FreeformImpressumActions;
          if (impressumElementOf(impressum, report)) {
            actions.updateAdditionalText?.(impressum.elementId, { text });
          } else {
            actions.addAdditionalTextElement?.(
              impressum.composeElement(format.id, pageLocale === 'de-AT', text)
            );
          }
        }
      },
    };
  }, [impressum, format, pages, observed]);
}
