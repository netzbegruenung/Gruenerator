import { eur } from '../utils/format';

import type { ExtractBelegResponse } from '@gruenerator/contracts';

/**
 * Makes receipt handling explicit at the position: proves a receipt is attached
 * AND that we read it (extracted amount/date/route), or prompts for the missing one.
 */
export function BelegStatus({
  beleg,
  confirmed,
  hasBetrag,
}: {
  beleg: ExtractBelegResponse | null;
  confirmed: boolean;
  hasBetrag: boolean;
}) {
  if (beleg) {
    const parts = [
      beleg.betrag != null ? eur(beleg.betrag) : null,
      beleg.datum,
      beleg.von && beleg.nach ? `${beleg.von} → ${beleg.nach}` : (beleg.von ?? beleg.nach ?? null),
    ].filter(Boolean);
    return (
      <div className="flex flex-col gap-0.5 rounded-md border border-primary bg-primary-50 px-md py-sm dark:bg-primary-900/30">
        <span className="text-sm font-semibold text-primary-700">✨ Beleg ausgelesen</span>
        {parts.length > 0 && <span className="text-sm text-primary-700">{parts.join(' · ')}</span>}
        {beleg.businessPackage === true && (
          <span className="text-xs text-primary-700">
            🥐 Frühstück als Business-Package erkannt.
          </span>
        )}
        <span className="text-xs text-primary-700">Bitte kurz prüfen und bei Bedarf anpassen.</span>
      </div>
    );
  }
  if (confirmed) {
    return (
      <span className="text-xs font-medium text-primary-700">
        ✓ Beleg liegt vor (manuell bestätigt).
      </span>
    );
  }
  if (hasBetrag) {
    return (
      <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
        ⚠️ Beleg erforderlich – bitte Rechnung hochladen, damit wir sie auslesen und prüfen können.
      </span>
    );
  }
  return null;
}
