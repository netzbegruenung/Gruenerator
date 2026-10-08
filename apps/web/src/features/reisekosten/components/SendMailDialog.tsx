/**
 * Submitting by e-mail — a MOCK. Nothing is sent: the dialog builds the PDF
 * the mail would carry (so its size is real), marks the Abrechnung as
 * eingereicht and says plainly that the dispatch was simulated. Real sending
 * needs a decision on where the PDF may go, since it carries the IBAN.
 */
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
import { useId, useState } from 'react';

import { erstellePdf } from '../pdf/erstellePdf';
import { TextInput } from '../ui';
import { eur } from '../utils/format';

import { defaultAuswahl, ExportKonfiguration, hatAnmerkungen } from './ExportDialog';

import type {
  BelegMeta,
  ComputeResult,
  FormularResponse,
  ReisekostenState,
} from '@gruenerator/contracts';

export const EMPFAENGER_VORGABE = 'reisekosten@gruene.de';

function vorgabeText(state: ReisekostenState, computed: ComputeResult): string {
  return [
    'Hallo,',
    '',
    `anbei meine Reisekostenabrechnung für „${state.reise.anlass}“ mit den Belegen.`,
    `Auszahlungsbetrag: ${eur(computed.auszahlung)}.`,
    '',
    'Viele Grüße',
    state.stammdaten.name,
  ].join('\n');
}

export function SendMailDialog({
  open,
  onOpenChange,
  abrechnungId,
  formular,
  state,
  computed,
  belege,
  lokaleDateien,
  onGesendet,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  abrechnungId: string;
  formular: FormularResponse | undefined;
  state: ReisekostenState;
  computed: ComputeResult;
  belege: BelegMeta[];
  lokaleDateien: Set<string>;
  onGesendet: () => Promise<void>;
}) {
  const id = useId();
  const [an, setAn] = useState(EMPFAENGER_VORGABE);
  const [betreff, setBetreff] = useState(`Reisekostenabrechnung: ${state.reise.anlass}`);
  const [text, setText] = useState(() => vorgabeText(state, computed));
  const [auswahl, setAuswahl] = useState(() => defaultAuswahl(belege, lokaleDateien));
  const [busy, setBusy] = useState(false);

  const senden = async () => {
    if (!formular) return;
    setBusy(true);
    try {
      const pdf = await erstellePdf({
        abrechnungId,
        formular,
        state,
        belege: belege.filter((b) => auswahl.belegIds.has(b.id)),
        optionen: auswahl.optionen,
      });
      await onGesendet();
      toast.success(
        `Versand simuliert – es wurde keine E-Mail verschickt (Anhang ${(pdf.size / 1024 / 1024).toFixed(1)} MB an ${an}).`
      );
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Versand fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Per E-Mail einreichen</DialogTitle>
          <DialogDescription>
            Vorschau: Der Versand ist noch nicht angebunden. „Senden“ markiert die Abrechnung als
            eingereicht, verschickt aber nichts.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-sm">
          <label htmlFor={`${id}-an`} className="text-sm font-semibold">
            An
          </label>
          <TextInput id={`${id}-an`} type="email" value={an} onChange={setAn} />
          <label htmlFor={`${id}-betreff`} className="text-sm font-semibold">
            Betreff
          </label>
          <TextInput id={`${id}-betreff`} value={betreff} onChange={setBetreff} />
          <label htmlFor={`${id}-text`} className="text-sm font-semibold">
            Nachricht
          </label>
          <textarea
            id={`${id}-text`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <ExportKonfiguration
          auswahl={auswahl}
          setAuswahl={setAuswahl}
          belege={belege}
          lokaleDateien={lokaleDateien}
          tage={computed.verpflegung.tage.length}
          hatAnmerkungen={hatAnmerkungen(state, belege)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button variant="brand" onClick={() => void senden()} disabled={busy || !formular || !an}>
            {busy ? 'Wird vorbereitet …' : 'Senden (Vorschau)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
