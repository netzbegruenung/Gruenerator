import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from '@gruenerator/ui';

// Single-select accordion, collapsible, first item open by default.
// Compound parts composed in one cell (Item > Trigger + Content).
export function Faq() {
  return (
    <div style={{ maxWidth: 480 }}>
      <Accordion type="single" collapsible defaultValue="datenschutz">
        <AccordionItem value="datenschutz">
          <AccordionTrigger>Wie werden meine Daten verarbeitet?</AccordionTrigger>
          <AccordionContent>
            Alle Inhalte werden ausschließlich auf EU-Servern gehostet. Deine
            Entwürfe sind privat und werden nicht zum Training von KI-Modellen
            verwendet.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="export">
          <AccordionTrigger>Kann ich Texte als PDF exportieren?</AccordionTrigger>
          <AccordionContent>
            Ja. Jede Pressemitteilung und jeder Antrag lässt sich als PDF, ODT
            oder formatierter Text herunterladen – direkt aus dem Editor.
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="team">
          <AccordionTrigger>Wie lade ich mein Team ein?</AccordionTrigger>
          <AccordionContent>
            Über die Mitgliederverwaltung kannst du Kolleg:innen aus deinem
            Kreis- oder Landesverband per E-Mail einladen und Rollen zuweisen.
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}
