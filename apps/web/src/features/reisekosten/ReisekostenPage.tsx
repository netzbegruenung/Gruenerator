import { Stepper } from './components/Stepper';
import { STEPS } from './constants';
import { useReisekostenWizard } from './hooks/useReisekostenWizard';
import { FahrtStep } from './steps/FahrtStep';
import { PersonStep } from './steps/PersonStep';
import { PruefenStep } from './steps/PruefenStep';
import { ReiseStep } from './steps/ReiseStep';
import { VerpflegungUebernachtungStep } from './steps/VerpflegungUebernachtungStep';
import { Button } from './ui';

export default function ReisekostenPage() {
  const {
    step,
    state,
    belege,
    setStep,
    update,
    setStammdaten,
    setReise,
    setVerpflegungAbzug,
    addBeleg,
    computed,
    clientFindings,
  } = useReisekostenWizard();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-lg px-lg pb-3xl pt-lg">
      <header className="flex flex-col gap-xs">
        <h1 className="text-3xl font-bold text-primary-700">Fahrtkosten-Grünerator</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Reisekostenabrechnung erstellen, Belege automatisch auswerten und prüfen lassen.
        </p>
      </header>

      <Stepper step={step} onStep={setStep} />

      <main className="flex flex-col gap-lg">
        {step === 0 && <ReiseStep state={state} setReise={setReise} />}
        {step === 1 && <PersonStep state={state} setStammdaten={setStammdaten} />}
        {step === 2 && (
          <FahrtStep state={state} belege={belege} update={update} onBeleg={addBeleg} />
        )}
        {step === 3 && (
          <VerpflegungUebernachtungStep
            state={state}
            belege={belege}
            update={update}
            onToggle={setVerpflegungAbzug}
            onBeleg={addBeleg}
            computed={computed}
          />
        )}
        {step === 4 && (
          <PruefenStep
            state={state}
            belege={belege}
            update={update}
            setStep={setStep}
            computed={computed}
            clientFindings={clientFindings}
          />
        )}

        <div className="flex justify-between gap-md">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Zurück
            </Button>
          ) : (
            <span />
          )}
          {step < STEPS.length - 1 && (
            <Button variant="brand" onClick={() => setStep(step + 1)}>
              Weiter
            </Button>
          )}
        </div>
      </main>
    </div>
  );
}
