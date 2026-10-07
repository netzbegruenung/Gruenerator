import { type PruefPunkt } from '@gruenerator/shared/reisekosten';
import { cn } from '@gruenerator/ui';
import { PiCheckCircleFill, PiCircleDashed, PiInfo, PiWarningCircleFill } from 'react-icons/pi';

import type { Finding } from '@gruenerator/contracts';

/** Section anchor a finding's field belongs to. */
function sectionOf(field: string): string {
  if (field.startsWith('stammdaten')) return 'antragsteller';
  if (field.startsWith('reise')) return 'reise';
  if (field.startsWith('fahrt')) return 'fahrtkosten';
  if (field.startsWith('verpflegung')) return 'verpflegung';
  if (field.startsWith('uebernachtung')) return 'uebernachtung';
  return 'summe';
}

const SECTION_OF_POSTEN: Record<PruefPunkt['posten'], string> = {
  bahn: 'fahrtkosten',
  oepnv: 'fahrtkosten',
  kfz: 'fahrtkosten',
  miete: 'fahrtkosten',
  taxi: 'fahrtkosten',
  sonstiges: 'fahrtkosten',
  uebernachtung: 'uebernachtung',
};

function jumpTo(section: string) {
  document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function Row({
  icon,
  label,
  detail,
  section,
}: {
  icon: React.ReactNode;
  label: string;
  detail?: string;
  section: string;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => jumpTo(section)}
        className="flex w-full items-start gap-sm rounded-lg px-xs py-xs text-left hover:bg-background-alt"
      >
        <span className="mt-[2px] shrink-0">{icon}</span>
        <span className="min-w-0">
          <span className="block text-sm">{label}</span>
          {detail && (
            <span className="block text-xs text-grey-600 dark:text-grey-400">{detail}</span>
          )}
        </span>
      </button>
    </li>
  );
}

function Gruppe({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-xxs">
      <h3 className="m-0 text-xs font-semibold uppercase tracking-wide text-grey-600 dark:text-grey-400">
        {titel}
      </h3>
      <ul className="m-0 flex list-none flex-col p-0">{children}</ul>
    </div>
  );
}

export function Pruefliste({ punkte, findings }: { punkte: PruefPunkt[]; findings: Finding[] }) {
  const fehler = findings.filter((f) => f.level === 'error');
  const hinweise = findings.filter((f) => f.level !== 'error');
  const fehlt = punkte.filter((p) => p.status === 'fehlt');
  const ok = punkte.filter((p) => p.status === 'ok');
  const tipps = punkte.filter((p) => p.status === 'hinweis');
  const icon = (cls: string, Comp: typeof PiInfo) => (
    <Comp aria-hidden className={cn('size-4', cls)} />
  );

  if (punkte.length === 0 && findings.length === 0) {
    return (
      <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
        Sobald du Beträge einträgst, steht hier, welche Belege dazugehören.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-md" aria-label="Prüfliste">
      {fehler.length > 0 && (
        <Gruppe titel="Noch auszufüllen">
          {fehler.map((f) => (
            <Row
              key={f.field + f.message}
              icon={icon('text-destructive', PiWarningCircleFill)}
              label={f.message}
              section={sectionOf(f.field)}
            />
          ))}
        </Gruppe>
      )}
      {fehlt.length > 0 && (
        <Gruppe titel="Noch einzureichen">
          {fehlt.map((p) => (
            <Row
              key={p.id}
              icon={icon('text-amber-600 dark:text-amber-400', PiCircleDashed)}
              label={p.label}
              {...(p.detail ? { detail: p.detail } : {})}
              section={SECTION_OF_POSTEN[p.posten]}
            />
          ))}
        </Gruppe>
      )}
      {ok.length > 0 && (
        <Gruppe titel="Hochgeladen">
          {ok.map((p) => (
            <Row
              key={p.id}
              icon={icon('text-primary-600', PiCheckCircleFill)}
              label={p.label}
              section={SECTION_OF_POSTEN[p.posten]}
            />
          ))}
        </Gruppe>
      )}
      {(tipps.length > 0 || hinweise.length > 0) && (
        <Gruppe titel="Hinweise">
          {tipps.map((p) => (
            <Row
              key={p.id}
              icon={icon('text-grey-500', PiInfo)}
              label={p.label}
              {...(p.detail ? { detail: p.detail } : {})}
              section={SECTION_OF_POSTEN[p.posten]}
            />
          ))}
          {hinweise.map((f) => (
            <Row
              key={f.field + f.message}
              icon={icon('text-grey-500', PiInfo)}
              label={f.message}
              section={sectionOf(f.field)}
            />
          ))}
        </Gruppe>
      )}
    </div>
  );
}
