import { PiFlask } from 'react-icons/pi';

/** Shown on every Reisekosten page: an experiment, not an offer of the party. */
export function ExperimentHinweis() {
  return (
    <p
      role="note"
      className="m-0 flex items-start gap-2.5 border-t border-grey-100 pt-4 text-[13px] leading-normal text-muted-foreground dark:border-grey-800"
    >
      <PiFlask aria-hidden className="mt-[2px] size-4 shrink-0" />
      <span>
        <strong className="font-semibold">Experiment</strong> des Grünerators – steht in keiner
        Verbindung zu den Gliederungen von BÜNDNIS 90/DIE GRÜNEN. Ersetzt keine Prüfung – maßgeblich
        sind die Regeln und Formulare der Stelle, bei der du abrechnest.
      </span>
    </p>
  );
}
