/**
 * Einmalige Länderfrage, wenn das Profil kein Land trägt.
 *
 * Warum ein Gate und keine Zeile in den Einstellungen: Das Land ist keine
 * Anzeigevorliebe, es entscheidet, was der Grünerator überhaupt liefert —
 * Parteiname, Ansprache, Notebook-Sammlungen, welche Werkzeuge angeboten
 * werden (Bundestag und Abgeordnetenwatch gibt es für Österreich nicht) und den
 * LÄNDERKONTEXT im Systemprompt. Ein falscher Wert fällt dabei nicht auf: die
 * deutsche Ausprägung ist die unmarkierte, sie liefert einfach plausible
 * deutsche Antworten. Genau deshalb hat es jahrelang niemand gemeldet.
 *
 * Warum überhaupt jemand ohne Land ankommt: Drei der vier Keycloak-IdPs
 * bezeichnen ein Land, der Grünerator-Login nicht — er ist für Mitarbeitende in
 * beiden Ländern gedacht. Dazu kommen Bestandskonten, deren 'de-DE' nie erhoben
 * war und von der Migration zurückgenommen wurde, sowie jeder IdP, der später
 * hinzukommt: `config/localeSync.ts` schreibt ohne Ländersignal nichts mehr,
 * statt wie früher auf Deutschland zu fallen. Die Frage landet dann hier.
 *
 * Anders als beim AiConsentGate gibt es hier keinen Abmelden-Ausgang: die Frage
 * ist keine Einwilligung, sondern eine Voreinstellung, die ohnehin jederzeit
 * unter Einstellungen → Sprache & Region änderbar ist. Es gibt nur keine
 * Antwort, die wir vorwegnehmen dürften — deshalb keine Vorauswahl und kein
 * „Später".
 */

import { Button, Dialog, DialogContent, DialogDescription, DialogTitle } from '@gruenerator/ui';
import { useState } from 'react';

import { useAuthStore } from '../../../stores/authStore';

import type { SupportedLocale } from '@gruenerator/contracts';

const CHOICES: { locale: SupportedLocale; label: string; hint: string }[] = [
  { locale: 'de-DE', label: 'Deutschland', hint: 'Bündnis 90/Die Grünen' },
  { locale: 'de-AT', label: 'Österreich', hint: 'Die Grünen – Die Grüne Alternative' },
];

export default function LocaleGate() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const updateLocale = useAuthStore((s) => s.updateLocale);

  const [saving, setSaving] = useState<SupportedLocale | null>(null);

  // `user.locale` ist der rohe Profilwert und darf leer sein; `state.locale` ist
  // die koerzierte Anzeigefassung und taugt hier nicht — sie wäre nie leer.
  //
  // Und dieser Rückfall ist ein offener Punkt, kein Detail: `effectiveLocale()`
  // (stores/authStore.ts:134) endet bei unbekanntem Profil-Land auf
  // `detectBrowserLocale()` — also auf der Browsersprache, genau der Heuristik,
  // die dieser Stand für den Login-Bildschirm durch die zeitzonenbasierte
  // `detectCountry()` ersetzt hat. Der Pfad wurde nicht mitgezogen und wirkt
  // weiter, solange das Gate unbeantwortet ist: `setApiLocale()` schickt die
  // Vermutung als `X-User-Locale` mit jeder Anfrage
  // (packages/shared/src/api/locale.ts), und weil `req.user.locale` für genau
  // diese Konten jetzt FEHLT, entscheidet im Backend nicht mehr Stufe 1, sondern
  // dieser Header (services/localization/LocalizationService.ts:105-127). Für
  // österreichische Konten ist das dieselbe falsche Antwort wie zuvor — der
  // Kopfkommentar in `api/locale.ts` beschreibt denselben Fehlertyp aus der
  // Vergangenheit (AT-Reels mit deutschem Untertitelsatz).
  //
  // Die Kette ist am Code nachgelesen; welche Konsumenten (Chat,
  // Notebook-Agenten) in diesem Fenster tatsächlich abweichen, ist NICHT
  // gemessen. Deshalb hier nur der Vermerk und keine Reparatur: das Fenster
  // schließt sich mit der Antwort auf diesen Dialog.
  //
  // Das Einwilligungs-Gate hat Vorrang: zwei modale Dialoge übereinander wären
  // beide nicht bedienbar, und die Einwilligung steht rechtlich vor allem
  // anderen.
  const needsLocale =
    isAuthenticated && user != null && user.ai_consent_at != null && user.locale == null;
  if (!needsLocale) return null;

  const choose = (locale: SupportedLocale) => {
    if (saving) return;
    setSaving(locale);
    void updateLocale(locale).finally(() => setSaving(null));
  };

  return (
    // Kein Schließen über Escape oder Klick daneben: Wegklicken wäre keine
    // Antwort, und der Dialog käme beim nächsten Rendern ohnehin wieder.
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        className="max-w-lg"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogTitle>In welchem Land bist Du grün aktiv?</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-3 text-sm text-foreground">
            <p>
              Dein Zugang verrät es uns nicht, und wir möchten nicht das Falsche raten — deshalb
              fragen wir einmal nach.
            </p>
            <p>
              Danach richten sich Wortwahl, Parteiname und die Quellen, in denen der Grünerator
              recherchiert. Ändern kannst Du es jederzeit unter Einstellungen → Sprache &amp;
              Region.
            </p>
          </div>
        </DialogDescription>

        <div className="flex flex-col gap-2 sm:flex-row">
          {CHOICES.map((choice) => (
            <Button
              key={choice.locale}
              type="button"
              variant="outline"
              className="h-auto flex-1 flex-col items-start gap-0.5 px-4 py-3 text-left"
              disabled={saving !== null}
              onClick={() => choose(choice.locale)}
            >
              <span className="font-semibold">
                {saving === choice.locale ? 'Wird gespeichert …' : choice.label}
              </span>
              <span className="text-xs text-foreground-muted">{choice.hint}</span>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
