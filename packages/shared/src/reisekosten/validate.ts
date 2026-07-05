/**
 * Deterministic rule checks for the Reisekosten form. Encodes the hard rules
 * from the official NRW form (deadlines, km cap, receipt obligations,
 * completeness). Fuzzy checks (receipt amount vs. entry, Business-Package) run
 * server-side against extracted belege — see the API validate route.
 */
import { type Finding, type ReisekostenState } from '@gruenerator/contracts';

import { getRate } from './rateConfig.js';

function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getTime());
  r.setMonth(r.getMonth() + months);
  return r;
}

function calendarDaysApart(a: string, b: string): number {
  const start = new Date(`${a.slice(0, 10)}T12:00:00`);
  const end = new Date(`${b.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

/**
 * @param now injectable reference date (defaults to the current date) — makes
 * the 3-month deadline check testable.
 */
export function validateReisekosten(state: ReisekostenState, now: Date = new Date()): Finding[] {
  const findings: Finding[] = [];
  const rate = getRate(state.rateKey);
  const push = (level: Finding['level'], field: string, message: string) =>
    findings.push({ level, field, message });

  // ── Completeness (rule a) ──────────────────────────────────────────────────
  const req: Array<[boolean, string, string]> = [
    [!state.stammdaten.name.trim(), 'stammdaten.name', 'Name fehlt.'],
    [!state.stammdaten.strasse.trim(), 'stammdaten.strasse', 'Straße fehlt.'],
    [!state.stammdaten.hausnr.trim(), 'stammdaten.hausnr', 'Hausnummer fehlt.'],
    [!state.stammdaten.plz.trim(), 'stammdaten.plz', 'PLZ fehlt.'],
    [!state.stammdaten.ort.trim(), 'stammdaten.ort', 'Ort fehlt.'],
    [!state.stammdaten.email.trim(), 'stammdaten.email', 'E-Mail fehlt.'],
    [!state.stammdaten.iban.trim(), 'stammdaten.iban', 'IBAN fehlt.'],
    [!state.reise.anlass.trim(), 'reise.anlass', 'Anlass der Reise fehlt.'],
    [!state.reise.ziel.trim(), 'reise.ziel', 'Ziel der Reise fehlt.'],
    [!state.reise.reisebeginn, 'reise.reisebeginn', 'Reisebeginn fehlt.'],
    [!state.reise.rueckkehr, 'reise.rueckkehr', 'Rückkehr fehlt.'],
  ];
  for (const [bad, field, message] of req) if (bad) push('error', field, message);

  // ── Reisezeiten plausibel ──────────────────────────────────────────────────
  if (state.reise.reisebeginn && state.reise.rueckkehr) {
    const beginn = new Date(state.reise.reisebeginn);
    const ende = new Date(state.reise.rueckkehr);
    if (!Number.isNaN(beginn.getTime()) && !Number.isNaN(ende.getTime()) && ende <= beginn) {
      push('error', 'reise.rueckkehr', 'Rückkehr liegt vor dem Reisebeginn.');
    }
  }

  // ── 3-Monats-Frist (rule b) ────────────────────────────────────────────────
  const refIso = state.reise.belegdatum || state.reise.rueckkehr;
  if (refIso) {
    const ref = new Date(refIso);
    if (!Number.isNaN(ref.getTime())) {
      let deadline = addMonths(ref, rate.fristMonate);
      const month = ref.getMonth(); // 10 = Nov, 11 = Dez
      if (month === 10 || month === 11) {
        const jan31 = new Date(ref.getFullYear() + 1, 0, 31, 23, 59, 59);
        if (jan31 < deadline) deadline = jan31;
      }
      if (now > deadline) {
        push(
          'error',
          'reise.belegdatum',
          `Die ${rate.fristMonate}-Monats-Frist ist überschritten – der Antrag ist nicht mehr erstattungsfähig.`,
        );
      }
    }
  }

  // ── Fahrtkosten ────────────────────────────────────────────────────────────
  if (state.fahrt.bahn && state.fahrt.bahn.betrag > 0 && !state.fahrt.bahn.belegVorhanden) {
    push('warn', 'fahrt.bahn', 'Bahnkosten angegeben, aber kein Originalbeleg hochgeladen (Pflicht).');
  }
  if (state.fahrt.oepnv && state.fahrt.oepnv.betrag > 0 && !state.fahrt.oepnv.belegVorhanden) {
    push('warn', 'fahrt.oepnv', 'ÖPNV-Kosten angegeben, aber kein Originalbeleg hochgeladen (Pflicht).');
  }

  const kfz = state.fahrt.kfz;
  if (kfz && kfz.km > 0) {
    if (!kfz.routenplanerVorhanden) {
      push('warn', 'fahrt.kfz.routenplanerVorhanden', 'Für Kfz-Fahrten muss ein Routenplaner-Ausdruck beigefügt werden.');
    }
    if (kfz.km > rate.kmObergrenze && !(kfz.dbFlexpreis && kfz.dbFlexpreis > 0)) {
      push(
        'error',
        'fahrt.kfz.dbFlexpreis',
        `Ab ${rate.kmObergrenze} km ist nur der DB-Flexpreis (2. Kl.) erstattungsfähig – bitte Flexpreis mit Beleg angeben.`,
      );
    }
  }

  const miete = state.fahrt.miete;
  if (miete && miete.betrag > 0) {
    if (!miete.belegVorhanden) {
      push('warn', 'fahrt.miete', 'Mietwagen/Carsharing nur mit Originalrechnung erstattungsfähig.');
    }
    if (!(miete.dbFlexpreis && miete.dbFlexpreis > 0)) {
      push('warn', 'fahrt.miete.dbFlexpreis', 'DB-Flexpreis-Beleg fehlt (bildet die Obergrenze).');
    } else if (miete.betrag > miete.dbFlexpreis) {
      push('warn', 'fahrt.miete.betrag', 'Mietkosten übersteigen den DB-Flexpreis (Obergrenze).');
    }
  }

  const taxi = state.fahrt.taxi;
  if (taxi && taxi.betrag > 0 && !taxi.begruendung.trim()) {
    push('error', 'fahrt.taxi.begruendung', 'Taxifahrten sind schriftlich zu begründen (Ausnahmefall).');
  }

  // ── Übernachtung (rule d) ──────────────────────────────────────────────────
  if (state.uebernachtung && state.reise.reisebeginn && state.reise.rueckkehr) {
    const nights = calendarDaysApart(state.reise.reisebeginn, state.reise.rueckkehr);
    if (nights <= 0) {
      push(
        'warn',
        'uebernachtung',
        'Übernachtung beantragt, aber die Reise erstreckt sich nicht über Nacht – nur bei Anreise vor 6 Uhr oder Rückkehr nach 24 Uhr erstattungsfähig (Regel d).',
      );
    }
  }

  // ── Verpflegung ────────────────────────────────────────────────────────────
  if (!state.uebernachtung && state.reise.reisebeginn && state.reise.rueckkehr) {
    const beginn = new Date(state.reise.reisebeginn);
    const ende = new Date(state.reise.rueckkehr);
    if (!Number.isNaN(beginn.getTime()) && !Number.isNaN(ende.getTime())) {
      const hours = (ende.getTime() - beginn.getTime()) / 3_600_000;
      if (hours > 0 && hours <= rate.eintaegigMinStunden) {
        push('info', 'verpflegung', 'Abwesenheit ≤ 8 Std – kein Anspruch auf Verpflegungsmehraufwand.');
      }
    }
  }

  return findings;
}
