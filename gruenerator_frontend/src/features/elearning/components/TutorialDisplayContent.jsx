import React from 'react';

const TutorialDisplayContent = ({ currentStep, formData = {}, isFormValid = false }) => {
  
  // Step 0: Introduction content
  if (currentStep === 0) {
    return `# Willkommen zum Universal Text Generator Tutorial

## Was ist der Universal Text Generator?

Der **Universal Text Generator** ist das Herzstück von Grünerator. Mit diesem Tool kannst du hochwertige Texte für verschiedene Zwecke generieren - von Pressemitteilungen bis zu Social Media Posts.

### 🎯 So funktioniert es:

1. **Thema eingeben**: Beschreibe kurz, worum es in deinem Text gehen soll
2. **Details hinzufügen**: Gib spezifische Informationen und den gewünschten Stil an
3. **Text generieren**: Lass die KI einen professionellen Text für dich erstellen

### ✨ Das macht den Generator besonders:

- **Intelligente KI**: Nutzt moderne Sprachmodelle für natürliche Texte
- **Politikfokus**: Speziell auf grüne Politik und Nachhaltigkeit ausgerichtet
- **Vielseitig**: Für verschiedene Texttypen und Zielgruppen geeignet
- **Einfach**: Intuitive Bedienung ohne technisches Vorwissen

### 📋 Interface-Überblick:

Das Interface ist in **zwei Bereiche** aufgeteilt:
- **Links**: Eingabeformular für Thema und Details
- **Rechts**: Vorschau und generierter Inhalt

Im nächsten Schritt kannst du das Interface selbst ausprobieren!`;
  }

  // Step 1: Interactive content that changes based on form data
  if (currentStep === 1) {
    if (!formData.thema && !formData.details) {
      return `# Schritt 2: Probiere das Interface aus

## Interaktive Erkundung

Jetzt kannst du das echte Interface ausprobieren! Tippe in die Felder links und beobachte, wie sich die Vorschau hier ändert.

### 🔧 Was du tun kannst:
- **Thema eingeben**: Probiere verschiedene Themen aus
- **Details hinzufügen**: Experimentiere mit verschiedenen Beschreibungen
- **Vorschau beobachten**: Sieh, wie sich die Anzeige in Echtzeit ändert

**Hinweis**: Dies ist nur eine Vorschau - es wird noch kein echter Text generiert.`;
    }

    // Dynamic content based on form input
    return `# Deine Eingaben

${formData.thema ? `## 📝 Thema
**${formData.thema}**

` : ''}${formData.details ? `## 📋 Details & Beschreibung
${formData.details}

` : ''}${isFormValid ? `### ✅ Formular komplett!
Alle Pflichtfelder sind ausgefüllt. In der echten Anwendung würde jetzt ein Text generiert werden.

**Next Steps:**
- Klicke auf "Text generieren" um den Vorgang zu starten
- Der generierte Text erscheint dann hier in diesem Bereich
- Du kannst den Text bearbeiten, exportieren oder speichern` : `### ⏳ Formular unvollständig
Fülle beide Felder aus, um zu sehen, wie die Generierung funktioniert.`}`;
  }

  return '';
};

export default TutorialDisplayContent;