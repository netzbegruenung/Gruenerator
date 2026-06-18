import { Alert, AlertTitle, AlertDescription } from '@gruenerator/ui';

const InfoIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></svg>
);
const AlertTriangle = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" /><path d="M12 9v4M12 17h.01" /></svg>
);

// Both variants stacked: each with a leading inline-SVG icon (grid auto-shifts
// title/description to the icon column), AlertTitle + AlertDescription.
export function Variants() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 460 }}>
      <Alert>
        <InfoIcon />
        <AlertTitle>Entwurf automatisch gespeichert</AlertTitle>
        <AlertDescription>
          Deine Änderungen am Antrag wurden um 14:32 Uhr gesichert. Du kannst
          jederzeit zur letzten Version zurückkehren.
        </AlertDescription>
      </Alert>
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Veröffentlichung fehlgeschlagen</AlertTitle>
        <AlertDescription>
          Die Pressemitteilung konnte nicht an den Presseverteiler gesendet
          werden. Bitte prüfe die Verbindung und versuche es erneut.
        </AlertDescription>
      </Alert>
    </div>
  );
}
