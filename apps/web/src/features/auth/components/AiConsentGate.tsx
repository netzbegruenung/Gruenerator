/**
 * Ausdrückliche Einwilligung nach Art. 9 Abs. 2 lit. a DSGVO, eingeholt vor der
 * ersten Nutzung der KI-Funktionen.
 *
 * Warum ein Gate und keine Zeile in den Einstellungen: Über den Grünerator
 * werden politische Inhalte erstellt, also können sich aus praktisch jeder
 * Eingabe besondere Kategorien im Sinne des Art. 9 DSGVO ergeben. Die
 * Datenschutzerklärung sagt zu, die Einwilligung „vor der ersten Nutzung der
 * KI-Funktionen gesondert" einzuholen — eine Einstellung, die man finden müsste,
 * wäre diese Zusage nicht.
 *
 * Drei Eigenschaften machen die Einwilligung wirksam, und alle drei stehen hier:
 * sie ist **ausdrücklich** (ein eigener Haken, nicht vorbelegt, kein „weiter =
 * einverstanden"), sie ist **aktiv** (ohne Haken bleibt der Bestätigen-Knopf
 * aus), und sie ist **freiwillig** — Ablehnen muss ohne Nachteil möglich sein
 * (Art. 7 Abs. 4 DSGVO), und ohne erreichbaren Ausgang wäre sie das nicht.
 * Persistiert wird sie serverseitig als Zeitstempel auf dem Profil —
 * localStorage wäre nach einem Gerätewechsel weg und taugt nicht als Nachweis
 * nach Art. 7 Abs. 1 DSGVO.
 */

import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@gruenerator/ui';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { useAuthStore } from '../../../stores/authStore';

export default function AiConsentGate() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setAiConsent = useAuthStore((s) => s.setAiConsent);
  const logout = useAuthStore((s) => s.logout);

  const [checked, setChecked] = useState(false);
  const [saving, setSaving] = useState(false);

  const needsConsent = isAuthenticated && user != null && user.ai_consent_at == null;
  if (!needsConsent) return null;

  const submit = () => {
    if (!checked || saving) return;
    setSaving(true);
    void setAiConsent(true).finally(() => setSaving(false));
  };

  return (
    // Kein Schließen über Escape oder Klick daneben: „weggeklickt" wäre weder
    // Zustimmung noch Ablehnung, und der Dialog käme beim nächsten Rendern
    // ohnehin wieder.
    //
    // Der Ausgang muss deshalb IM Dialog liegen. Radix' modaler Fokus-Trap
    // sperrt Tastatur und Zeiger auf den Rest der Seite aus — der Abmelden-Knopf
    // in der Seitenleiste ist für Nichteinwilligende schlicht nicht erreichbar,
    // und ohne Ausgang wäre die Einwilligung nicht freiwillig (Art. 7 Abs. 4
    // DSGVO). Dasselbe gilt nach einem Widerruf über Einstellungen →
    // Datenschutz: der Dialog steht dann sofort wieder da, und ohne diesen Knopf
    // hätte ausgerechnet der zugesagte Widerruf die Nutzer*in ausgesperrt.
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>Bevor es losgeht: Deine Einwilligung</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Der Grünerator ist eine KI-gestützte Plattform. Was Du in die Eingabefelder schreibst
              oder sprichst, wird zur Bearbeitung an KI-Dienstleister mit Verarbeitung in der EU
              weitergeleitet.
            </p>
            <p>
              Weil hier politische Inhalte entstehen, können sich aus Deinen Eingaben{' '}
              <strong>politische Meinungen</strong> ergeben — das sind besondere Kategorien
              personenbezogener Daten (Art. 9 DSGVO). Dafür brauchen wir Deine ausdrückliche
              Einwilligung.
            </p>
            <p>
              Ob und welche solcher Inhalte Du eingibst, entscheidest allein Du. Ein Training der
              KI-Modelle mit Deinen Daten findet nicht statt. Einzelheiten stehen in der{' '}
              <Link to="/datenschutz" className="underline">
                Datenschutzerklärung
              </Link>
              .
            </p>
          </div>
        </DialogDescription>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-subtle)] p-3 text-sm">
          <Checkbox
            checked={checked}
            onCheckedChange={(v) => setChecked(v === true)}
            className="mt-0.5"
          />
          <span>
            Ich willige ausdrücklich ein, dass meine Eingaben verarbeitet werden, auch soweit sie
            besondere Kategorien personenbezogener Daten wie politische Meinungen enthalten (Art. 9
            Abs. 2 lit. a DSGVO).
          </span>
        </label>

        <p className="text-xs text-foreground-muted">
          Du kannst diese Einwilligung jederzeit mit Wirkung für die Zukunft widerrufen — unter
          Einstellungen → Datenschutz.
        </p>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button type="button" variant="ghost" disabled={saving} onClick={() => void logout()}>
            Ohne Einwilligung abmelden
          </Button>
          <Button type="button" disabled={!checked || saving} onClick={submit}>
            {saving ? 'Wird gespeichert …' : 'Einwilligen und fortfahren'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
