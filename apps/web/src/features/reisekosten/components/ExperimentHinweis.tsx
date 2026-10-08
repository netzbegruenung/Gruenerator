import { PiFlask } from 'react-icons/pi';

/** Shown on every Reisekosten page: an experiment, not an offer of the party. */
export function ExperimentHinweis() {
  return (
    <p
      role="note"
      className="m-0 flex items-start gap-sm rounded-[14px] border border-grey-200 px-md py-sm text-sm text-grey-700 dark:border-grey-700 dark:text-grey-300"
    >
      <PiFlask aria-hidden className="mt-[2px] size-4 shrink-0" />
      <span>
        <strong className="font-semibold text-foreground">Experiment:</strong> Der
        Reisekosten-Generator ist ein Experiment des Grünerators und steht in keiner Verbindung zu
        den Gliederungen von BÜNDNIS 90/DIE GRÜNEN. Er ersetzt keine Prüfung – maßgeblich sind die
        Regeln und Formulare der Stelle, bei der du abrechnest.
      </span>
    </p>
  );
}
