import { STEPS } from './steps'; // Corrected import path

export const CUSTOM_GENERATOR_HELP_CONTENT = {
  [STEPS.BASICS]: {
    title: 'Basisdaten festlegen',
    content:
      'Gib deinem neuen Grünerator einen Namen und lege fest, unter welcher URL er später erreichbar sein soll.',
    tips: [
      "Der Name sollte beschreiben, was der Grünerator tut (z.B. 'Social Media Post Generator').",
      'Der URL-Pfad wird automatisch generiert, kann aber angepasst werden (nur Kleinbuchstaben, Zahlen, Bindestriche).',
    ],
  },
  [STEPS.FIELDS]: {
    title: 'Formularfelder definieren',
    content:
      'Lege fest, welche Eingabefelder der Benutzer sehen soll. Diese Felder werden später als Variablen an die KI übergeben.',
    tips: [
      'Füge bis zu 5 Felder hinzu.',
      "Definiere ein klares Label (z.B. 'Thema des Posts').",
      'Wähle den passenden Feld-Typ (Kurzer oder Langer Text).',
      'Du kannst optional einen Hilfetext (Platzhalter) hinzufügen.',
      'Markiere wichtige Felder als Pflichtfelder.',
    ],
  },
  // [STEPS.DOCUMENTS]: {
  //   title: "Dokumente hinzufügen (optional)",
  //   content: "Wähle PDF-Dokumente aus, die als Wissensquelle für deinen Generator dienen sollen. Claude kann während der Texterstellung auf diese Dokumente zugreifen und relevante Inhalte zitieren.",
  //   tips: [
  //     "Diese Funktion ist optional - Generatoren funktionieren auch ohne Dokumente.",
  //     "Nur vollständig verarbeitete PDF-Dokumente können hinzugefügt werden.",
  //     "Dokumente werden intelligent durchsucht, um relevante Informationen zu finden.",
  //     "Generierte Texte enthalten Quellenangaben, wenn Dokumente verwendet wurden.",
  //     "Du kannst jederzeit weitere Dokumente hinzufügen oder entfernen."
  //   ]
  // },
  [STEPS.PROMPT]: {
    title: 'Prompt definieren',
    content:
      'Schreibe die Anweisung (Prompt), die an die KI gesendet wird. Die Inhalte der zuvor definierten Formularfelder werden automatisch als Variablen übergeben.',
    tips: [
      'Beschreibe genau, was die KI generieren soll.',
      'Gib Kontext, Zielgruppe und gewünschten Ton an.',
      'Die Platzhalter für deine Felder (z.B. {{thema_des_posts}}) werden automatisch am Ende des Prompts hinzugefügt und müssen hier nicht manuell eingefügt werden.',
    ],
  },
  [STEPS.REVIEW]: {
    title: 'Überprüfung',
    content: 'Überprüfe alle deine Eingaben, bevor du den Grünerator speicherst.',
    tips: [
      'Kontrolliere Name, URL, die definierten Felder und den finalen Prompt.',
      "Klicke auf 'Speichern', um den Grünerator zu erstellen und zur Benutzung freizugeben.",
    ],
  },
};

// Optional: Function to get content based on step and potentially other state
export const getCustomGeneratorHelpContent = (step) => {
  return CUSTOM_GENERATOR_HELP_CONTENT[step] || null;
};
