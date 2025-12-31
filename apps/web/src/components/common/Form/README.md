# BaseForm Komponente

## Übersicht

Die BaseForm ist eine zentrale Komponente des Gruenerator-Frontends, die für die Darstellung und Verwaltung von Formularen und deren generierten Inhalten zuständig ist. Sie wurde modularisiert, um die Wartbarkeit und Erweiterbarkeit zu verbessern.

## Struktur

Die BaseForm-Komponente wurde in folgende Module aufgeteilt:

### Hauptkomponenten

- **BaseForm.js**: Die Hauptkomponente, die alle anderen Komponenten orchestriert
- **FormSection.js**: Verantwortlich für die Darstellung des Formularbereichs
- **DisplaySection.js**: Verantwortlich für die Darstellung des generierten Inhalts
- **ContentRenderer.js**: Rendert den generierten Inhalt basierend auf verschiedenen Bedingungen
- **ErrorDisplay.js**: Zeigt Fehlermeldungen an

### Hooks

- **useFormState.js**: Verwaltet den Zustand des Formulars (Sichtbarkeit, Multi-Plattform-Status, etc.)
- **useContentManagement.js**: Verwaltet den generierten Inhalt und den Bearbeitungsmodus
- **useErrorHandling.js**: Verwaltet Fehler und Fehlermeldungen
- **useResponsive.js**: Verwaltet responsive Anpassungen
- **usePlatformDetection.js**: Erkennt Plattformen im generierten Inhalt

### Utilities

- **classNameUtils.js**: Hilfsfunktionen für die Berechnung von Klassennamen
- **validationUtils.js**: Hilfsfunktionen für die Validierung von Formulardaten

### Konstanten

- **constants/index.js**: Enthält Konstanten wie Button-Labels

## Logik

1. **Formular-Zustandsverwaltung**:
   - Die `useFormState`-Hook verwaltet den Zustand des Formulars
   - Bei mehreren Plattformen wird das Formular automatisch ausgeblendet
   - Der Benutzer kann das Formular mit dem Toggle-Button ein- und ausblenden

2. **Inhaltsmanagement**:
   - Die `useContentManagement`-Hook verwaltet den generierten Inhalt
   - Der Benutzer kann zwischen Anzeige- und Bearbeitungsmodus wechseln

3. **Plattformerkennung**:
   - Die `usePlatformDetection`-Hook erkennt Plattformen im generierten Inhalt
   - Bei mehreren Plattformen wird der Multi-Plattform-Modus aktiviert

4. **Responsive Anpassungen**:
   - Die `useResponsive`-Hook passt die Darstellung an verschiedene Bildschirmgrößen an

## Verwendung

Die BaseForm-Komponente wird wie folgt verwendet:

```jsx
<BaseForm
  title="Mein Formular"
  onSubmit={handleSubmit}
  loading={loading}
  success={success}
  error={error}
  generatedContent={generatedContent}
  usePlatformContainers={true}
>
  {/* Formularfelder */}
</BaseForm>
```

## Props

Die BaseForm-Komponente akzeptiert folgende Props:

- **title**: Der Titel des Formulars
- **children**: Die Formularfelder
- **onSubmit**: Die Funktion, die beim Absenden des Formulars aufgerufen wird
- **loading**: Gibt an, ob das Formular gerade lädt
- **success**: Gibt an, ob das Formular erfolgreich abgesendet wurde
- **error**: Eine Fehlermeldung, falls ein Fehler aufgetreten ist
- **formErrors**: Ein Objekt mit Fehlermeldungen für einzelne Formularfelder
- **onGeneratePost**: Eine Funktion, die aufgerufen wird, wenn der Benutzer einen Post generieren möchte
- **generatedPost**: Der generierte Post
- **allowEditing**: Gibt an, ob der Benutzer den generierten Inhalt bearbeiten darf
- **initialContent**: Der initiale Inhalt des Formulars
- **alwaysEditing**: Gibt an, ob der Bearbeitungsmodus immer aktiv sein soll
- **hideEditButton**: Gibt an, ob der Bearbeitungsbutton ausgeblendet werden soll
- **isMultiStep**: Gibt an, ob es sich um ein mehrstufiges Formular handelt
- **onBack**: Die Funktion, die aufgerufen wird, wenn der Benutzer zurück geht
- **showBackButton**: Gibt an, ob der Zurück-Button angezeigt werden soll
- **nextButtonText**: Der Text des Weiter-Buttons
- **generatedContent**: Der generierte Inhalt
- **hideDisplayContainer**: Gibt an, ob der Anzeigecontainer ausgeblendet werden soll
- **usePlatformContainers**: Gibt an, ob Plattform-Container verwendet werden sollen
- **helpContent**: Hilfsinhalte für das Formular
- **submitButtonProps**: Props für den Submit-Button
- **disableAutoCollapse**: Deaktiviert das automatische Einklappen des Formulars
- **featureToggle**: Konfiguration für den Feature-Toggle
- **useFeatureToggle**: Gibt an, ob der Feature-Toggle verwendet werden soll 