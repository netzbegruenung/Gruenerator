import React from 'react';

import { manifest, type ProviderHost, type Role } from '@site/src/components/modelsManifest';

/** Rolle → Zusatz hinter der Aufgabe. `primary` bekommt keinen. */
const ROLE_SUFFIX: Record<Exclude<Role, 'primary'>, string> = {
  fallback: ' (Ausweichweg)',
  overflow: ' (Überlauf)',
};

/**
 * Welche Aufgaben EIN Anbieter beim Grünerator übernimmt — aus derselben
 * `src/generated/models.json`, die auch `<ModelTable />` speist und die
 * `models:generate` aus dem Routing-Code liest.
 *
 * ── Warum es diese Komponente gibt ──
 *
 * Die Nachhaltigkeitsseite zählte diese Rollen in Prosa auf, inklusive
 * Modell-IDs („übernimmt das Schreiben von Antworten (`gemma4-31b`)").
 * Neben einer generierten Tabelle, die dasselbe sagt. Das ging genau so lange
 * gut, bis eine Lane den Host wechselte: die Tabelle zog automatisch mit, die
 * Prosa nicht — und die öffentliche Seite behauptete am Ende drei Rollen, die
 * das Routing so nicht mehr kannte (Einordnung bei Regolo statt GreenPT,
 * Antworten bei Regolo statt Cortecs, Überlauf auf eine selbst gehostete
 * Instanz, die keine Anfrage mehr bedient).
 *
 * Modellnamen stehen hier bewusst NICHT. Sie ändern sich mehrmals im Quartal,
 * und wer sie lesen will, findet sie eine Überschrift weiter oben in
 * `<ModelTable />`. Was auf dieser Seite zählt, ist die Anbieter-Ebene: wo
 * gerechnet wird, entscheidet den Strommix — nicht, welche Gewichte dort
 * liegen.
 *
 * ── Warum ein unbekannter Anbieter hier BRICHT ──
 *
 * `host` nimmt die Union, nicht `string` — ein Tippfehler im Aufruf ist damit
 * ein Typfehler. Was die Union allein nicht sieht, ist die Umbenennung: Heisst
 * der Anbieter im Generator plötzlich anders, passt der alte Name weiterhin auf
 * die (dann ebenfalls veraltete) Union. Dagegen stehen zwei Netze — der Wächter
 * in `modelsManifest.ts` und der Wurf unten, wenn ein angesprochener Anbieter
 * keine einzige Zeile hat.
 *
 * Das ist bewusst strenger als ein stilles `null`. Ein Anbieter ohne Zeile ist
 * kein Sonderfall, der sich von selbst richtig darstellt: Entweder ist der Name
 * falsch, oder der Anbieter bedient keine Lane mehr — und dann gehört sein
 * Abschnitt überarbeitet, nicht halb gerendert. Genau dieser Fall ist am
 * 29.08.2026 eingetreten (die selbst gehostete Instanz), und aufgefallen ist er
 * damals nur von Hand.
 */
export function ProviderTasks({ host }: { host: ProviderHost }): React.JSX.Element {
  const tasks = manifest.rows
    .map((row) => {
      const mine = row.models.filter((m) => m.host === host);
      if (mine.length === 0) return null;
      // Ist der Anbieter für dieselbe Aufgabe primär UND Ausweich, zählt
      // primär — sonst läse sich die stärkere Rolle wie eine Einschränkung.
      const role = mine.some((m) => m.role === 'primary') ? 'primary' : mine[0].role;
      return role === 'primary' ? row.task : `${row.task}${ROLE_SUFFIX[role]}`;
    })
    .filter((t): t is string => t !== null);

  if (tasks.length === 0) {
    throw new Error(
      `<ProviderTasks host="${host}" /> findet keine Aufgabe in models.json. ` +
        `Bedient der Anbieter keine Lane mehr? Dann gehört sein Abschnitt in ` +
        `documentation/docs/basics/nachhaltigkeit.md überarbeitet, nicht leer gerendert.`
    );
  }

  return (
    <p>
      <strong>Beim Grünerator:</strong> {tasks.join(' · ')}
    </p>
  );
}

export default ProviderTasks;
