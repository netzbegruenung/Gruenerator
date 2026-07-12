import { useMemo, useState } from 'react';

import { generatePdf, validateReise } from '../api';
import { STEPS } from '../constants';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  NumberInput,
} from '../ui';
import { stepForField } from '../utils/findings';
import { eur } from '../utils/format';
import { buildPosten } from '../utils/posten';

import type { ComputeResult, ExtractBelegResponse, Finding, ReisekostenState } from '@gruenerator/contracts';

export function PruefenStep({
  state,
  belege,
  update,
  setStep,
  computed,
  clientFindings,
}: {
  state: ReisekostenState;
  belege: ExtractBelegResponse[];
  update: (patch: (s: ReisekostenState) => ReisekostenState) => void;
  setStep: (n: number) => void;
  computed: ComputeResult;
  clientFindings: Finding[];
}) {
  const [serverFindings, setServerFindings] = useState<Finding[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const findings = serverFindings ?? clientFindings;
  const errors = findings.filter((f) => f.level === 'error');
  const warnings = findings.filter((f) => f.level === 'warn');
  const infos = findings.filter((f) => f.level === 'info');
  const hasError = errors.length > 0;
  const hasHinweis = warnings.length > 0 || infos.length > 0;

  // Group blocking errors by the step that owns them, for the jump-to-step panel.
  const errorGroups = useMemo(() => {
    const byStep = new Map<number, string[]>();
    for (const f of errors) {
      const idx = stepForField(f.field);
      const list = byStep.get(idx) ?? [];
      list.push(f.message.replace(/\.$/, ''));
      byStep.set(idx, list);
    }
    return [...byStep.entries()].sort((a, b) => a[0] - b[0]).map(([idx, items]) => ({ idx, items }));
  }, [errors]);

  const posten = buildPosten(state, computed);

  const runCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await validateReise(state, belege);
      setServerFindings(res.findings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prüfung fehlgeschlagen');
    } finally {
      setChecking(false);
    }
  };

  const download = async () => {
    setGenerating(true);
    setError(null);
    try {
      const { filename, blob } = await generatePdf(state);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'PDF-Erstellung fehlgeschlagen');
    } finally {
      setGenerating(false);
    }
  };

  const mailto = `mailto:reisekosten@gruene.de?subject=${encodeURIComponent(
    `Reisekostenabrechnung: ${state.reise.anlass || 'Dienstreise'}`,
  )}`;

  return (
    <div className="flex flex-col gap-lg">
      {hasError && (
        <div className="flex flex-col overflow-hidden rounded-lg bg-card shadow-sm">
          <div className="flex items-center gap-md bg-destructive/10 p-lg">
            <span className="flex size-8 flex-none items-center justify-center rounded-full bg-destructive text-lg font-bold text-white">
              !
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-bold">
                {errors.length === 1 ? '1 Angabe fehlt noch' : `${errors.length} Angaben fehlen noch`}
              </span>
              <span className="text-xs text-muted-foreground">
                Tippe auf einen Schritt, um die Angaben zu ergänzen.
              </span>
            </div>
          </div>
          {errorGroups.map((g) => (
            <button
              key={g.idx}
              type="button"
              onClick={() => setStep(g.idx)}
              className="flex items-center gap-md border-t border-border p-lg text-left transition-colors hover:bg-background-alt"
            >
              <span className="flex size-7 flex-none items-center justify-center rounded-full bg-background-alt text-xs font-bold text-muted-foreground">
                {g.idx + 1}
              </span>
              <div className="flex flex-1 flex-col gap-xs">
                <span className="text-sm font-semibold">{STEPS[g.idx]}</span>
                <div className="flex flex-wrap gap-xs">
                  {g.items.map((it) => (
                    <span
                      key={it}
                      className="rounded-full bg-destructive/10 px-sm py-0.5 text-xs font-medium text-destructive"
                    >
                      {it}
                    </span>
                  ))}
                </div>
              </div>
              <span className="flex-none text-lg text-muted-foreground">→</span>
            </button>
          ))}
        </div>
      )}

      {!hasError && !hasHinweis && (
        <div className="flex items-start gap-md rounded-lg border border-primary bg-primary-50 p-lg dark:bg-primary-900/30">
          <span className="text-xl leading-none">✅</span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-primary-700">Alles vollständig</span>
            <span className="text-sm text-primary-700">Die Abrechnung kann exportiert werden.</span>
          </div>
        </div>
      )}
      {!hasError && hasHinweis && (
        <div className="flex items-start gap-md rounded-lg border border-amber-300 bg-amber-50 p-lg dark:bg-amber-950">
          <span className="text-xl leading-none">⚠️</span>
          <div className="flex flex-col">
            <span className="text-sm font-bold text-amber-800 dark:text-amber-200">Export möglich – bitte Hinweise prüfen</span>
            <span className="text-sm text-amber-800 dark:text-amber-200">
              Die Abrechnung ist vollständig, es gibt aber offene Hinweise (unten).
            </span>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Prüfen & Spende</CardTitle>
          <CardDescription>Belege per KI abgleichen und optional eine Spende angeben.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-md">
            <Button variant="outline" onClick={() => void runCheck()} disabled={checking}>
              {checking ? 'Prüfe…' : '🔍 Mit KI prüfen (Belege abgleichen)'}
            </Button>
            {hasHinweis && (
              <div className="flex flex-col gap-xs">
                {warnings.map((w) => (
                  <div
                    key={`${w.field}-${w.message}`}
                    className="rounded-md border border-amber-300 bg-amber-50 px-md py-sm text-sm text-amber-800 dark:bg-amber-950"
                  >
                    ⚠️ {w.message}
                  </div>
                ))}
                {infos.map((i) => (
                  <div
                    key={`${i.field}-${i.message}`}
                    className="rounded-md border border-border px-md py-sm text-sm text-muted-foreground"
                  >
                    ℹ️ {i.message}
                  </div>
                ))}
              </div>
            )}
            <Field
              label="Spende an BÜNDNIS 90 / DIE GRÜNEN (optional)"
              hint="Bei der Steuererklärung werden 50 % der Spende zurückerstattet."
            >
              <NumberInput
                value={state.spende || null}
                onChange={(v) => update((s) => ({ ...s, spende: v ?? 0 }))}
              />
            </Field>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Abrechnung</CardTitle>
          <CardDescription>
            {[state.reise.anlass, state.reise.ziel].filter(Boolean).join(' · ') || 'Angaben aus Schritt 1'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col">
            {posten.map((p) => (
              <div
                key={p.name}
                className="flex justify-between gap-md border-b border-border py-sm text-sm last:border-b-0"
              >
                <div className="flex flex-col gap-0.5">
                  <span className="font-semibold">{p.name}</span>
                  {p.detail && <span className="text-xs text-muted-foreground">{p.detail}</span>}
                  {p.beleg === 'ok' && (
                    <span className="text-xs font-medium text-primary-700">✓ Beleg vorhanden</span>
                  )}
                  {p.beleg === 'missing' && (
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-300">⚠️ Beleg fehlt</span>
                  )}
                </div>
                <span className="whitespace-nowrap tabular-nums">{p.betrag}</span>
              </div>
            ))}
            {state.spende > 0 && (
              <div className="flex justify-between gap-md border-b border-border py-sm text-sm">
                <span className="font-semibold">Spende</span>
                <span className="tabular-nums">−{eur(computed.spende)}</span>
              </div>
            )}
            <div className="flex justify-between pt-md text-base font-bold">
              <span>{state.spende > 0 ? 'Auszahlungsbetrag' : 'Erstattungsbetrag'}</span>
              <span className="tabular-nums text-primary-700">{eur(computed.auszahlung)}</span>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="brand" disabled={hasError || generating} onClick={() => void download()}>
            {generating ? 'PDF wird erstellt…' : '📄 Als PDF exportieren'}
          </Button>
          <Button
            variant="brand-outline"
            disabled={hasError}
            onClick={() => {
              window.location.href = mailto;
            }}
          >
            Per E-Mail einreichen
          </Button>
        </CardFooter>
      </Card>

      {hasError && <span className="text-sm text-destructive">Bitte zuerst die offenen Angaben (oben) ergänzen.</span>}
      {error && <span className="text-sm text-destructive">{error}</span>}
    </div>
  );
}
