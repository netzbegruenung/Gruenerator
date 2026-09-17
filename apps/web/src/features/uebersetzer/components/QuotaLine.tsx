import { type TranslationQuota } from '@gruenerator/contracts';

import { NF } from './languageOptions';

/** "Heute: 12.345 / 200.000 Zeichen" — the per-user daily DeepL budget. */
export function QuotaLine({ quota }: { quota: TranslationQuota }) {
  return (
    <p className="m-0 text-xs text-grey-500">
      Heute: {NF.format(quota.used)} / {NF.format(quota.limit)} Zeichen
    </p>
  );
}
