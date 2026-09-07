import { Button, Input, MultiStepForm } from '@gruenerator/ui';
import {
  useAddShareLink,
  useTestConnection,
  validateShareLink,
  type ConnectionErrorCode,
} from '@gruenerator/wolke';
import { AnimatePresence, motion } from 'motion/react';
import { memo, useState } from 'react';
import {
  FiAlertTriangle,
  FiCheck,
  FiChevronDown,
  FiExternalLink,
  FiFolder,
  FiImage,
  FiShare2,
} from 'react-icons/fi';

import { cn } from '@/utils/cn';

interface WolkeSetupWizardProps {
  onSuccess?: (message: string) => void;
  onError?: (message: string) => void;
  onCancel?: () => void;
}

const TOTAL_STEPS = 4;

const StepIcon = ({
  icon: Icon,
  color = 'text-primary-500',
}: {
  icon: React.ElementType;
  color?: string;
}) => (
  <div
    className={cn(
      'flex items-center justify-center size-10 rounded-xl bg-primary-50 dark:bg-primary-950/30',
      color
    )}
  >
    <Icon className="size-5" />
  </div>
);

const StepFooter = ({ onNext, onCancel }: { onNext: () => void; onCancel?: () => void }) => (
  <div className="flex justify-end gap-sm mt-md">
    {onCancel && (
      <Button variant="ghost" size="sm" onClick={onCancel}>
        Abbrechen
      </Button>
    )}
    <Button onClick={onNext} size="sm">
      Weiter
    </Button>
  </div>
);

const StepImage = memo(({ src, alt }: { src: string; alt: string }) => {
  const [open, setOpen] = useState(false);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-xs text-xs text-grey-400 hover:text-grey-600 dark:hover:text-grey-300 transition-colors"
      >
        <FiImage className="size-3.5" />
        Bild anzeigen
        <FiChevronDown
          className={cn('size-3 transition-transform duration-200', open && 'rotate-180')}
        />
      </button>
      <div
        className={cn(
          'grid transition-all duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100 mt-sm' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <img
            src={src}
            alt={alt}
            className="rounded-lg border border-grey-200 dark:border-grey-700 w-full"
            loading="lazy"
          />
        </div>
      </div>
    </div>
  );
});
StepImage.displayName = 'StepImage';

const WolkeSetupWizard = ({ onSuccess, onError, onCancel }: WolkeSetupWizardProps) => {
  const [step, setStep] = useState(0);
  const [shareLink, setShareLink] = useState('');
  const [label, setLabel] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const [errorCode, setErrorCode] = useState<ConnectionErrorCode | null>(null);

  const addMutation = useAddShareLink();
  const testMutation = useTestConnection();

  const isValidLink = shareLink.trim().length > 0 && validateShareLink(shareLink).isValid;

  const handleNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));

  const handleConnect = async () => {
    if (!isValidLink) return;

    setIsTesting(true);

    try {
      const result = await testMutation.mutateAsync(shareLink);

      if (!result.success) {
        setErrorCode(result.errorCode ?? 'unknown');
        setIsTesting(false);
        setStep(3);
        return;
      }
    } catch {
      setErrorCode('unknown');
      setIsTesting(false);
      setStep(3);
      return;
    }

    try {
      await addMutation.mutateAsync({ url: shareLink, label });
      setIsTesting(false);
      onSuccess?.('Wolke-Verbindung wurde erfolgreich eingerichtet!');
    } catch (error) {
      setIsTesting(false);
      onError?.('Fehler: ' + (error instanceof Error ? error.message : String(error)));
    }
  };

  const handleShareLinkChange = (value: string) => {
    setShareLink(value);
  };

  return (
    <div className="max-w-[28rem] mx-auto w-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          <MultiStepForm currentStep={step}>
            {/* Step 0: Open Wolke & select folder */}
            <MultiStepForm.Step>
              <div className="flex flex-col gap-md">
                <StepIcon icon={FiFolder} />
                <p className="text-sm text-foreground leading-relaxed m-0">
                  Öffne die Grüne Wolke und melde dich an. Wähle einen bestehenden Ordner oder
                  erstelle einen neuen für deine Grünerator-Dateien.
                </p>
                <p className="text-xs text-grey-400 m-0">
                  Ein eigener Ordner wie „Grünerator" hilft bei der Organisation.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open('https://wolke.netzbegruenung.de', '_blank')}
                  className="w-fit"
                >
                  <FiExternalLink className="size-4" />
                  wolke.netzbegruenung.de öffnen
                </Button>
                <StepImage
                  src="/images/wolke-tutorial/step2.png"
                  alt="Ordnerauswahl in der Grünen Wolke"
                />
                <StepFooter onNext={handleNext} onCancel={onCancel} />
              </div>
            </MultiStepForm.Step>

            {/* Step 1: Create share link */}
            <MultiStepForm.Step>
              <div className="flex flex-col gap-md">
                <StepIcon icon={FiShare2} />
                <p className="text-sm text-foreground leading-relaxed m-0">
                  Wähle den Ordner aus und klicke rechts auf <strong>„Teilen"</strong>. Klicke dann
                  unten auf <strong>„Öffentlichen Link erstellen"</strong> und kopiere den Link.
                </p>
                <p className="text-xs text-grey-400 m-0">
                  Die Standard-Berechtigung „Nur anzeigen" genügt — der Grünerator liest deine Wolke
                  nur. Wähle nicht „Dateien ablegen": Eine reine Upload-Freigabe kann der Grünerator
                  nicht lesen.
                </p>
                <StepImage
                  src="/images/wolke-tutorial/step5.png"
                  alt="Teilen-Dialog: Öffentlichen Link erstellen"
                />
                <StepFooter onNext={handleNext} onCancel={onCancel} />
              </div>
            </MultiStepForm.Step>

            {/* Step 2: Paste link & connect */}
            <MultiStepForm.Step>
              <div className="flex flex-col gap-md">
                <p className="text-sm text-foreground leading-relaxed m-0">
                  Füge den kopierten Link hier ein.
                </p>
                <div className="flex flex-col gap-xs">
                  <label
                    htmlFor="wizard-url"
                    className="text-xs font-medium text-foreground-heading"
                  >
                    Wolke-Link
                  </label>
                  <Input
                    id="wizard-url"
                    type="url"
                    value={shareLink}
                    onChange={(e) => handleShareLinkChange(e.target.value)}
                    placeholder="https://wolke.netzbegruenung.de/s/..."
                    disabled={isTesting}
                    className={cn(isValidLink && 'border-primary-500')}
                  />
                  {!isValidLink && shareLink.length > 0 && (
                    <span className="text-xs text-grey-400">
                      Das sieht nicht nach einem Wolke-Link aus
                    </span>
                  )}
                </div>

                <div
                  className={cn(
                    'grid transition-all duration-200 ease-out',
                    isValidLink ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
                  )}
                >
                  <div className="overflow-hidden">
                    <div className="flex flex-col gap-md">
                      <div className="flex flex-col gap-xs">
                        <label
                          htmlFor="wizard-label"
                          className="text-xs font-medium text-foreground-heading"
                        >
                          Bezeichnung (optional)
                        </label>
                        <Input
                          id="wizard-label"
                          type="text"
                          value={label}
                          onChange={(e) => setLabel(e.target.value)}
                          placeholder="z.B. Ortsverband, Mein Ordner..."
                          disabled={isTesting}
                        />
                      </div>

                      <div className="flex justify-end gap-sm">
                        {onCancel && (
                          <Button variant="ghost" size="sm" onClick={onCancel} disabled={isTesting}>
                            Abbrechen
                          </Button>
                        )}
                        <Button onClick={handleConnect} disabled={!isValidLink || isTesting}>
                          {isTesting ? (
                            <>
                              <div className="size-3.5 border-2 border-transparent border-t-current rounded-full animate-spin" />
                              Wird geprüft...
                            </>
                          ) : (
                            'Verbinden'
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {!isValidLink && (
                  <div className="flex justify-end gap-sm">
                    {onCancel && (
                      <Button variant="ghost" size="sm" onClick={onCancel}>
                        Abbrechen
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </MultiStepForm.Step>

            {/* Step 3: Troubleshooting (shown when test fails) */}
            <MultiStepForm.Step>
              <div className="flex flex-col gap-md">
                <StepIcon icon={FiAlertTriangle} color="text-amber-600 dark:text-amber-400" />

                {errorCode === 'invalid_link' && (
                  <p className="text-sm text-foreground leading-relaxed m-0">
                    Der Link funktioniert nicht (mehr) — die Freigabe wurde gelöscht, ist abgelaufen
                    oder ist passwortgeschützt. Erstelle in der Wolke einen neuen Link ohne Passwort
                    über „Teilen" → „Öffentlichen Link erstellen".
                  </p>
                )}

                {errorCode === 'file_drop' && (
                  <p className="text-sm text-foreground leading-relaxed m-0">
                    Der Link ist eine Upload-Freigabe („Dateien ablegen"). Damit kann der Grünerator
                    nichts lesen. Erstelle in der Wolke einen neuen Freigabe-Link mit der
                    Berechtigung „Nur anzeigen".
                  </p>
                )}

                {errorCode === 'not_found' && (
                  <p className="text-sm text-foreground leading-relaxed m-0">
                    Der Ordner oder Link wurde nicht gefunden. Prüfe, ob der Ordner noch in deiner
                    Wolke vorhanden ist.
                  </p>
                )}

                {(errorCode === 'forbidden' || errorCode === 'unknown' || !errorCode) && (
                  <>
                    <p className="text-sm text-foreground leading-relaxed m-0">
                      Die Verbindung hat nicht geklappt. Prüfe folgende Punkte:
                    </p>
                    <ul className="flex flex-col gap-sm text-sm text-foreground m-0 pl-md">
                      <li>Der Link wurde über „Öffentlichen Link erstellen" erzeugt</li>
                      <li>Der Ordner existiert noch</li>
                      <li>Der Link ist nicht passwortgeschützt</li>
                    </ul>
                  </>
                )}

                <div className="flex justify-end gap-sm mt-md">
                  {onCancel && (
                    <Button variant="ghost" size="sm" onClick={onCancel}>
                      Abbrechen
                    </Button>
                  )}
                  <Button
                    size="sm"
                    onClick={() =>
                      setStep(errorCode === 'invalid_link' || errorCode === 'not_found' ? 2 : 1)
                    }
                  >
                    Nochmal versuchen
                  </Button>
                </div>
              </div>
            </MultiStepForm.Step>
          </MultiStepForm>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WolkeSetupWizard;
