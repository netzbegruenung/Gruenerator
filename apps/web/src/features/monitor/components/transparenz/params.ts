/**
 * The page's URL state. Each param deletes itself at its default so the bare
 * path stays the canonical link.
 *
 * `ansicht=experten`, `locale` and `bereich` are links people have shared; the
 * names stay even though the expert view is now called "Rechenweg".
 */
import {
  type TransparencyFeature,
  type TransparencyLocale,
  transparencyFeatureSchema,
} from '@gruenerator/contracts';
import { getPinnedLocale } from '@gruenerator/shared/instances';
import { useSearchParams } from 'react-router-dom';

import { CURRENT_INSTANCE } from '../../../../config/instance';

/** The window every figure on the page describes. Fixed: one number, one story. */
export const TRANSPARENCY_DAYS = 30;

export const LOCALE_LABELS: Record<TransparencyLocale, string> = {
  de: 'Deutschland',
  at: 'Österreich',
};

function useParam(name: string): [string | null, (value: string | null) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const set = (value: string | null) => {
    setSearchParams(
      (prev) => {
        const params = new URLSearchParams(prev);
        if (value === null) params.delete(name);
        else params.set(name, value);
        return params;
      },
      { replace: true }
    );
  };
  return [searchParams.get(name), set];
}

/** Narrative ("Nachhaltigkeit") by default, the full arithmetic ("Rechenweg") on demand. */
export function useRechenwegParam(): { rechenweg: boolean; setRechenweg: (v: boolean) => void } {
  const [raw, set] = useParam('ansicht');
  return {
    rechenweg: raw === 'experten',
    setRechenweg: (next) => set(next ? 'experten' : null),
  };
}

/**
 * Which country's users the figure describes; `null` is the whole instance.
 * Not defaulted from the profile: the platform total is the figure this page
 * exists for. An instance that pins its locale (bgst) has nothing to split.
 */
export function useTransparencyLocaleParam(): {
  locale: TransparencyLocale | null;
  setLocale: (locale: TransparencyLocale | null) => void;
  available: boolean;
} {
  const [raw, set] = useParam('locale');
  const available = getPinnedLocale(CURRENT_INSTANCE) === null;
  const locale = available && (raw === 'de' || raw === 'at') ? raw : null;
  return { locale, setLocale: set, available };
}

export function isTransparencyFeature(value: string | null): value is TransparencyFeature {
  return transparencyFeatureSchema.safeParse(value).success;
}

/** One product area instead of the whole platform; `null` is everything. */
export function useFeatureParam(): {
  feature: TransparencyFeature | null;
  setFeature: (feature: TransparencyFeature | null) => void;
} {
  const [raw, set] = useParam('bereich');
  return { feature: isTransparencyFeature(raw) ? raw : null, setFeature: set };
}
