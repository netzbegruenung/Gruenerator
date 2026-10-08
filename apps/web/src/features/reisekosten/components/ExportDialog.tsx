import {
  BELEG_KATEGORIEN,
  POSTEN_LABEL,
  postenOf,
  sortBelegeNachFormular,
} from '@gruenerator/shared/reisekosten';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@gruenerator/ui';
import { useState } from 'react';

import { downloadBlob } from '../../../utils/downloadFile';
import { dateinameFuer, erstellePdf } from '../pdf/erstellePdf';
import { FORM_TAGE } from '../pdf/fillForm';
import { Checkbox } from '../ui';

import type { ExportOptionen } from '../pdf/buildAbrechnungPdf';
import type { BelegMeta, FormularResponse, ReisekostenState } from '@gruenerator/contracts';

export interface ExportAuswahl {
  optionen: ExportOptionen;
  belegIds: Set<string>;
}

/** The configuration part, shared with the mail dialog. */
export function ExportKonfiguration({
  auswahl,
  setAuswahl,
  belege,
  lokaleDateien,
  tage,
  hatAnmerkungen,
}: {
  auswahl: ExportAuswahl;
  setAuswahl: (a: ExportAuswahl) => void;
  belege: BelegMeta[];
  lokaleDateien: Set<string>;
  tage: number;
  hatAnmerkungen: boolean;
}) {
  const setOpt = (patch: Partial<ExportOptionen>) =>
    setAuswahl({ ...auswahl, optionen: { ...auswahl.optionen, ...patch } });
  const toggleBeleg = (id: string, on: boolean) => {
    const ids = new Set(auswahl.belegIds);
    if (on) ids.add(id);
    else ids.delete(id);
    setAuswahl({ ...auswahl, belegIds: ids });
  };

  return (
    <div className="flex flex-col gap-md">
      <fieldset className="m-0 flex flex-col gap-xs border-0 p-0">
        <legend className="mb-xs text-sm font-semibold">Formular</legend>
        <Checkbox
          label="Ausgefülltes Formular (Seite 1)"
          checked={auswahl.optionen.formular}
          onChange={(on) => setOpt({ formular: on })}
        />
        <Checkbox
          label="Abrechnungshinweise (Seite 2)"
          checked={auswahl.optionen.hinweise}
          onChange={(on) => setOpt({ hinweise: on })}
        />
        {hatAnmerkungen && (
          <Checkbox
            label="Anmerkungen und Beleg-Kommentare (eigene Seite)"
            checked={auswahl.optionen.anmerkungen}
            onChange={(on) => setOpt({ anmerkungen: on })}
          />
        )}
        {tage > FORM_TAGE && (
          <Checkbox
            label={`Tagesaufstellung Verpflegung (${tage} Tage, das Formular hat nur ${FORM_TAGE} Spalten)`}
            checked={auswahl.optionen.tagesaufstellung}
            onChange={(on) => setOpt({ tagesaufstellung: on })}
          />
        )}
      </fieldset>
      <fieldset className="m-0 flex flex-col gap-xs border-0 p-0">
        <legend className="mb-xs text-sm font-semibold">Belege anhängen</legend>
        {belege.length === 0 && (
          <p className="m-0 text-sm text-grey-600 dark:text-grey-400">
            Noch keine Belege hochgeladen.
          </p>
        )}
        {sortBelegeNachFormular(belege).map((b) => {
          const vorhanden = lokaleDateien.has(b.id);
          return (
            <div key={b.id} className="flex flex-col">
              <Checkbox
                label={`${POSTEN_LABEL[postenOf(b)]} · ${BELEG_KATEGORIEN[b.kategorie].label} – ${b.dateiname}`}
                checked={vorhanden && auswahl.belegIds.has(b.id)}
                onChange={(on) => vorhanden && toggleBeleg(b.id, on)}
              />
              {!vorhanden && (
                <span className="ml-lg text-xs text-amber-700 dark:text-amber-300">
                  Datei liegt nicht auf diesem Gerät
                </span>
              )}
            </div>
          );
        })}
      </fieldset>
    </div>
  );
}

/** Whether the remarks page would have content: a general note or a beleg comment. */
export function hatAnmerkungen(state: ReisekostenState, belege: BelegMeta[]): boolean {
  return !!state.anmerkungen?.trim() || belege.some((b) => !!b.kommentar?.trim());
}

export function defaultAuswahl(belege: BelegMeta[], lokaleDateien: Set<string>): ExportAuswahl {
  return {
    optionen: { formular: true, hinweise: false, tagesaufstellung: true, anmerkungen: true },
    belegIds: new Set(belege.filter((b) => lokaleDateien.has(b.id)).map((b) => b.id)),
  };
}

export function ExportDialog({
  open,
  onOpenChange,
  abrechnungId,
  formular,
  state,
  belege,
  lokaleDateien,
  tage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  abrechnungId: string;
  formular: FormularResponse | undefined;
  state: ReisekostenState;
  belege: BelegMeta[];
  lokaleDateien: Set<string>;
  tage: number;
}) {
  const [auswahl, setAuswahl] = useState(() => defaultAuswahl(belege, lokaleDateien));
  const [busy, setBusy] = useState(false);

  const nichtsGewaehlt =
    !auswahl.optionen.formular && !auswahl.optionen.hinweise && auswahl.belegIds.size === 0;

  const download = async () => {
    if (!formular) return;
    setBusy(true);
    try {
      const blob = await erstellePdf({
        abrechnungId,
        formular,
        state,
        belege: belege.filter((b) => auswahl.belegIds.has(b.id)),
        optionen: auswahl.optionen,
      });
      await downloadBlob(blob, dateinameFuer(state));
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'PDF konnte nicht erstellt werden');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>PDF herunterladen</DialogTitle>
          <DialogDescription>
            Das PDF entsteht auf deinem Gerät – Formular und Belege werden dafür nicht hochgeladen.
          </DialogDescription>
        </DialogHeader>
        <ExportKonfiguration
          auswahl={auswahl}
          setAuswahl={setAuswahl}
          belege={belege}
          lokaleDateien={lokaleDateien}
          tage={tage}
          hatAnmerkungen={hatAnmerkungen(state, belege)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            variant="brand"
            onClick={() => void download()}
            disabled={busy || !formular || nichtsGewaehlt}
          >
            {busy ? 'PDF wird erstellt …' : 'PDF erstellen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
