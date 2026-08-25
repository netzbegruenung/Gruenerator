import React from 'react';

import manifestJson from '@site/src/generated/models.json';

type Role = 'primary' | 'fallback' | 'overflow';

interface ModelEntry {
  model: string;
  code: string;
  label: string;
  provider: string;
  host: string;
  flag: string;
  role: Role;
}

interface Row {
  id: string;
  task: string;
  models: ModelEntry[];
}

interface Manifest {
  rows: Row[];
  hosts: string[];
}

const manifest = manifestJson as unknown as Manifest;

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
 * Die Nachhaltigkeitsseite zählte diese Rollen bis zum 25.08.2026 in Prosa auf,
 * inklusive Modell-IDs („übernimmt das Schreiben von Antworten (`gemma4-31b`)").
 * Neben einer generierten Tabelle, die dasselbe sagt. Das ging genau so lange
 * gut, bis eine Lane den Host wechselte: die Tabelle zog automatisch mit, die
 * Prosa nicht — und eine öffentliche Seite widersprach der Anbieterliste im
 * Nachbarordner.
 *
 * Modellnamen stehen hier bewusst NICHT. Sie ändern sich mehrmals im Quartal,
 * und wer sie lesen will, findet sie eine Überschrift weiter oben in
 * `<ModelTable />`. Was auf dieser Seite zählt, ist die Anbieter-Ebene: wo
 * gerechnet wird, entscheidet den Strommix — nicht, welche Gewichte dort
 * liegen.
 *
 * Ein Anbieter ohne Zeile in der Tabelle rendert nichts, statt einen leeren
 * Satz zu behaupten.
 */
export function ProviderTasks({ host }: { host: string }): React.JSX.Element | null {
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

  if (tasks.length === 0) return null;

  return (
    <p>
      <strong>Beim Grünerator:</strong> {tasks.join(' · ')}
    </p>
  );
}

export default ProviderTasks;
