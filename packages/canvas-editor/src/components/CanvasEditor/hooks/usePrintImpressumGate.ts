/**
 * Export gate for the poster's V.i.S.d.P. / Impressum. The element lives on
 * the FIRST page (composePrint puts it there) whichever page is active, so the
 * editor feeds this hook page 1's own state, keyed by page id. Fails closed:
 * until page 1 has reported, the gate is `ready: false` and blocks.
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

/** What page 1 last reported. */
export interface ObservedPageState {
  pageId: string;
  state: Record<string, unknown>;
  actions: Record<string, unknown>;
}

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

/** True when page 1 is known and its impressum line is filled in. */
export function isPosterImpressumComplete(
  firstPage: GatePage | null,
  observed: ObservedPageState | null
): boolean {
  if (!firstPage || !observed || observed.pageId !== firstPage.id) return false;
  const locale = impressumLocaleOf(firstPage);
  const element = impressumElementOf(observed);
  return isImpressumComplete(parseImpressumLine(locale, element?.text ?? ''));
}

export function usePrintImpressumGate(
  format: PrintCanvasFormat | null,
  firstPage: GatePage | null,
  observed: ObservedPageState | null
): PrintImpressumGate | null {
  const firstPageId = firstPage?.id ?? null;
  const configId = firstPage?.configId ?? null;
  return useMemo(() => {
    if (!isPosterFormat(format)) return null;
    const locale = impressumLocaleOf(
      firstPageId && configId ? { id: firstPageId, configId } : null
    );
    // Keyed by page id: a report from a page that is no longer first is stale.
    if (!firstPageId || !observed || observed.pageId !== firstPageId) {
      return { ready: false, locale, text: null, onSubmit: () => {} };
    }
    const actions = observed.actions as FreeformImpressumActions;
    const element = impressumElementOf(observed);
    return {
      ready: true,
      locale,
      text: element ? element.text : null,
      onSubmit: (parts) => {
        const text = impressumLine(locale, parts);
        if (element) {
          actions.updateAdditionalText?.(PRINT_IMPRESSUM_ID, { text });
        } else {
          actions.addAdditionalTextElement?.(
            composePrintImpressum(format.id as PrintFormatId, locale === 'de-AT', text)
          );
        }
      },
    };
  }, [format, firstPageId, configId, observed]);
}
