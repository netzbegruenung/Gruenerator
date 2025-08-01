// constants.js

// Sharepic Types
export const SHAREPIC_TYPES = {
  QUOTE: 'Zitat',
  QUOTE_PURE: 'Zitat_Pure',
  THREE_LINES: 'Dreizeilen',
  HEADLINE: 'Headline',
  INFO: 'Info'
};

// Form Steps
export const FORM_STEPS = {
  WELCOME: 'welcome',
  TYPE_SELECT: 'type_select',
  ZITAT_SUB_SELECT: 'zitat_sub_select',
  INPUT: 'input',
  PREVIEW: 'preview',
  RESULT: 'result'
};

// Font Sizes
export const FONT_SIZES = {
  S: 75,
  M: 85,
  L: 105
};

export const MAX_FONT_SIZE = 120;
export const MIN_FONT_SIZE = 75;

// Default Colors
export const DEFAULT_COLORS = [
  { background: '#005538', text: '#F5F1E9' },
  { background: '#F5F1E9', text: '#005538' },
  { background: '#F5F1E9', text: '#005538' }
];

// Validation Messages
export const VALIDATION_MESSAGES = {
  REQUIRED_THEME: 'Thema ist erforderlich',
  REQUIRED_TYPE: 'Typ ist erforderlich',
  REQUIRED_FIELD: 'Dieses Feld ist erforderlich.',
  INVALID_FILE_TYPE: 'Ungültiger Dateityp.',
  FILE_UPLOAD_FAILED: 'Datei-Upload fehlgeschlagen.'
};

// Button Labels
export const BUTTON_LABELS = {
  GENERATE_TEXT: 'Text Grünerieren',
  GENERATE_IMAGE: 'Bild Grünerieren',
  GENERATE_IMAGE_MOBILE: 'Grünerieren',
  MODIFY_IMAGE: 'Bild anpassen',
  UPLOAD_FILE: 'Datei hochladen',
  SUBMIT: 'Grünerieren',
  CHANGE_FILE: 'Ändern',
  BACK: 'Zurück',
  DOWNLOAD: 'Download',
  COPY: 'Kopieren',
  REGENERATE_TEXT: 'Text neu-Grünerieren',
  MENU: 'Menü',
  CLOSE_MENU: 'Menü schließen',
  UNSPLASH_SELECT: 'Zufälliges Naturbild von Unsplash'
};

// ARIA Labels
export const ARIA_LABELS = {
  BACK: 'Zurück zum vorherigen Schritt',
  SUBMIT: 'Formular absenden',
  DOWNLOAD: 'Generiertes Bild herunterladen',
  GENERATE_POST: 'Beitragstext generieren',
  COPY: 'Generierten Text kopieren',
  REGENERATE_TEXT: 'Neuen Beitragstext generieren',
  TOGGLE_DARK_MODE: 'Dunkelmodus umschalten'
};

// Announcements
export const ANNOUNCEMENTS = {
  GENERATING_TEXT: 'Generiere Beitragstext...',
  TEXT_GENERATED: 'Beitragstext wurde erfolgreich generiert.',
  TEXT_GENERATION_ERROR: 'Fehler beim Generieren des Beitragstexts.',
  TEXT_COPIED: 'Text wurde in die Zwischenablage kopiert.',
  UNSPLASH_SELECT: 'Zufälliges Naturbild von Unsplash auswählen',
  UNSPLASH_IMAGE_LOADING: "Lade zufälliges Bild von Unsplash...",
  UNSPLASH_IMAGE_LOADED: "Bild von Unsplash erfolgreich geladen",
  UNSPLASH_IMAGE_ERROR: "Fehler beim Laden des Bildes von Unsplash"
};

// UI Elements
export const UI_ELEMENTS = {
  MODIFIED_IMAGE: 'Modifiziertes Bild',
  GENERATED_SHAREPIC: 'Generiertes Sharepic',
  FOOTER: 'Fußzeile',
  HEADER: 'Kopfzeile',
  NAV_MENU: 'Navigationsmenü'
};

// Error Messages
export const ERROR_MESSAGES = {
  NO_IMAGE_DATA: 'Keine Bilddaten empfangen',
  NETWORK_ERROR: 'Netzwerkfehler bei der Bildmodifikation',
  TYPE: 'Sharepic-Typ ist erforderlich.',
  THEMA: 'Thema ist erforderlich.',
  DETAILS: 'Details sind erforderlich.',
  QUOTE: 'Zitat ist erforderlich.',
  NAME: 'Name ist erforderlich.',
  LINE1: 'Zeile 1 ist erforderlich.',
  LINE2: 'Zeile 2 ist erforderlich.',
  LINE3: 'Zeile 3 ist erforderlich.',
  NO_FILE_SELECTED: 'Keine Datei ausgewählt',
  FORM_VALIDATION_FAILED: 'Formularvalidierung fehlgeschlagen',
  NO_TEXT_DATA: 'Keine Textdaten empfangen',
  FILE_UPLOAD_ERROR: 'Fehler beim Hochladen der Datei',
  NO_IMAGE_SELECTED: 'Bitte wählen Sie ein Bild aus',
  NO_MODIFIED_IMAGE_DATA: 'Keine modifizierten Bilddaten empfangen'
};

// SharepicGenerator specific constants
export const SHAREPIC_GENERATOR = {
  TITLE: "Sharepic Grünerator",
  DEFAULT_FONT_SIZE: FONT_SIZES.M,
  DEFAULT_BALKEN_OFFSET: [50, -100, 50],
  DEFAULT_COLOR_SCHEME: DEFAULT_COLORS,
  ALLOWED_FILE_TYPES: ['image/*'],
  CONFIRMATION_MESSAGES: {
    BACK_TO_START: "Möchtest du wirklich zurück zum ersten Schritt? Das grünerierte Sharepic geht verloren."
  },
  LOG_MESSAGES: {
    FORM_SUBMISSION_STARTED: 'SharepicGenerator: Form submission started',
    GENERATING_TEXT: 'Generating text, current step:',
    TEXT_GENERATED: 'Text generated, updating form data',
    FORM_DATA_UPDATED: 'Form data updated, new step:',
    GENERATED_IMAGE_RESULT: 'Generated image result:',
    MODIFYING_IMAGE: 'Modifying image with params:',
    IMAGE_MODIFIED: 'Image modified successfully'
  }
};

export const IMAGE_MODIFICATION = {
  BALKEN_OFFSET: {
    MIN: -250,
    MAX: 250,
    STEP: 50,
    COUNT: 3
  },
  FONT_SIZE: {
    OPTIONS: [
      { label: 'S', value: FONT_SIZES.S },
      { label: 'M', value: FONT_SIZES.M },
      { label: 'L', value: FONT_SIZES.L }
    ]
  },

  COLOR_SCHEMES: [
    {
      name: 'Tanne Sand Sand',
      colors: [
        { background: '#005538', text: '#F5F1E9' },
        { background: '#F5F1E9', text: '#005538' },
        { background: '#F5F1E9', text: '#005538' }
      ],
      imageSrc: '/images/Tanne_Sand_Sand.png'
    },
    {
      name: 'Sand-Tanne-Tanne',
      colors: [
        { background: '#F5F1E9', text: '#005538' },
        { background: '#005538', text: '#F5F1E9' },
        { background: '#005538', text: '#F5F1E9' }
      ],
      imageSrc: '/images/Sand_Tanne_Tanne.png'
    },
    {
      name: 'Sand_Tanne_Sand',
      colors: [
        { background: '#F5F1E9', text: '#005538' },
        { background: '#005538', text: '#F5F1E9' },
        { background: '#F5F1E9', text: '#005538' }
      ],
      imageSrc: '/images/Sand_Tanne_Sand.png'
    },
    {
      name: 'Sand_Sand_Tanne',
      colors: [
        { background: '#F5F1E9', text: '#005538' },
        { background: '#F5F1E9', text: '#005538' },
        { background: '#005538', text: '#F5F1E9' }
      ],
      imageSrc: '/images/Sand_Sand_Tanne.png'
    }
  ],
  
  LABELS: {
    FONT_SIZE: 'Schriftgröße:',
    TEXT_POSITION_TITLE: "Balken-Position",
    TEXT_POSITION_DESCRIPTION: "Verschieben Sie die Regler, um die Position der Textbalken anzupassen",
    COLOR_SCHEME: 'Farbschema',
    COLOR_SCHEME_DESCRIPTION: 'Wählen Sie das Farbschema für Ihr Bild aus, indem Sie auf eines der Bilder klicken.',
    BALKEN_GRUPPE_TITLE: "Balkengruppe verschieben",
    BALKEN_GRUPPE_DESCRIPTION: "Verschieben Sie die gesamte Balkengruppe auf dem Bild.",
    SUNFLOWER_TITLE: "Sonnenblume verschieben",
    SUNFLOWER_DESCRIPTION: "Passen Sie die Position der Sonnenblume auf dem Bild an.",
    BALKEN_OFFSET_PRESETS: 'Balken-Voreinstellungen',
    BALKEN_OFFSET_PRESETS_DESCRIPTION: 'Wählen Sie eine Voreinstellung für die Position der Textbalken aus.',
  },
  BALKEN_GRUPPE_STEP: 100,
  SUNFLOWER_STEP: 25,
};

// Form Labels
export const FORM_LABELS = {
  THEME: 'Thema',
  DETAILS: 'Details',
  QUOTE: 'Zitat',
  NAME: 'Name',
  LINE1: 'Zeile 1',
  LINE2: 'Zeile 2',
  LINE3: 'Zeile 3',
  FILE_UPLOAD: 'Datei hochladen',
  IDEE: 'Idee',
  GLIEDERUNG: 'Gliederung',
  WHAT: 'Was passiert?',
  DETAILS_ALL: 'Alle wichtigen Details',
  WHO_QUOTE: 'Wer soll zitiert werden?',
  PRESS_CONTACT: 'Pressekontakt',
  TYPE: 'Sharepic-Typ',
  LOCATION: 'Ort',
  ORGANIZATION: 'Gliederung',
  CHARACTER_COUNT: 'Zeichenzahl'
};

// Form Placeholders
export const FORM_PLACEHOLDERS = {
  THEME: 'Gib das Thema ein...',
  QUOTE: 'Gib ein Zitat ein...',
  NAME: 'Gib den Namen ein...',
  LINE1: 'Gib die erste Zeile ein...',
  LINE2: 'Gib die zweite Zeile ein...',
  LINE3: 'Gib die dritte Zeile ein...',
  FILE_UPLOAD: 'Wähle eine Datei...',
  IDEE: 'Worum gehts?',
  DETAILS: 'Alle wichtigen Details und Anweisungen, zum Beispiel wo etwas gebaut wird. Du kannst hier auch Hinweise zur Sprache oder Korrekturen angeben.',
  GLIEDERUNG: 'Grüne Fraktion Musterdorf',
  DRAG_AND_DROP: 'Ziehe eine Datei hierher oder klicke, um eine Datei auszuwählen',
  WHAT: 'Initiative für mehr Grünflächen in der Stadt',
  DETAILS_ALL: 'Durch Baumpflanzaktionen, neue Parks und grüne Dachflächen in Kooperation mit lokalen Schulen und Unternehmen.',
  WHO_QUOTE: 'Alex Schmidt, Sprecher*in der Grünen OV Musterdorf',
  PRESS_CONTACT: 'Alex Schmidt, Sprecher*in, 01234 567890, alex.schmidt@gruene-musterdorf.de',
  TYPE: 'Bitte wählen',
  LOCATION: 'Gib den Ort oder die Region an, z.B. Siegburg, Köln etc...',
  ORGANIZATION: 'Gib die Gliederung an, z.B. LOrtsverband Detmold...',
  CHARACTER_COUNT: 'Gib die gewünschte Zeichenzahl (mindestens 1000) ein.'
};

// Footer Text
export const FOOTER_TEXT = {
  COPYRIGHT: '© 2024. Eine Website von Moritz Wächter. Alle Rechte vorbehalten. Der Grünerator wird unterstützt von der netzbegrünung.',
  MEMBERSHIP: 'Du kannst hier Mitglied werden.',
  MEMBERSHIP_LINK: 'https://netzbegruenung.de/verein/mitgliedsantrag/',
  NETZBEGRUENUNG_LINK: 'https://netzbegruenung.de/',
  SOCIAL_MEDIA: {
    TWITTER: 'https://twitter.com/MoritzWaech',
    INSTAGRAM: 'https://www.instagram.com/moritz_waechter/?hl=bg',
    LINKEDIN: 'https://www.linkedin.com/in/moritz-w%C3%A4chter-6ab033210'
  }
};

// Header Text
export const HEADER_TEXT = {
  LOGO_ALT: 'Grünerator Logo',
  MENU: 'Menü',
  CLOSE_MENU: 'Menü schließen',
  DARK_MODE_TOGGLE: 'Dunkelmodus umschalten',
  SECTIONS: {
    GRUENERATOREN: 'Grüneratoren',
    GPTS: 'GPTs',
    GRUENERATOR_WEB: 'Grünerator Web'
  },
  DROPDOWN_ITEMS: {
    GRUENERATOREN: [
      { LINK: '/universal', TEXT: 'Universal Grünerator', ICON: 'PiMagicWand' },
      { LINK: '/antragsgenerator', TEXT: 'Anträge', ICON: 'PiFileText' },
      { LINK: '/pressemitteilung', TEXT: 'Pressemitteilungen', ICON: 'PiNewspaper' },
      { LINK: '/socialmedia', TEXT: 'Social Media', ICON: 'PiInstagramLogo' },
      { LINK: '/rede', TEXT: 'Politische Rede', ICON: 'PiMicrophone' },
      { LINK: '/antragsversteher', TEXT: 'Antrags-Erklärer', ICON: 'PiLightbulb' }
    ],
    GPTS: [
      { LINK: 'https://chat.openai.com/g/g-Xd3HrGped-wahlprufstein-grunerator', TEXT: 'Wahlprüfstein', ICON: 'PiFile' },
      { LINK: 'https://chat.openai.com/g/g-ZZwx8kZS3-grunerator-social-media', TEXT: 'Social Media', ICON: 'PiGlobe' }
    ],
    GRUENERATOR_WEB: [
      { LINK: '/webbaukasten', TEXT: 'Webbaukasten', ICON: 'PiDeviceMobile' },
      { LINK: 'https://person.webbegruenung.de', TEXT: 'Demo-Seite', ICON: 'PiLink' }
    ]
  }
};

export const WAHLPROGRAMM_GENERATOR = {
  TITLE: "Wahlprogramm-Grünerator",
  SUBTITLE: "Erstelle ein Kapitel für dein Wahlprogramm",
  CONFIRMATION_MESSAGES: {
    BACK_TO_START: "Möchtest du wirklich zurück zum ersten Schritt? Das generierte Wahlprogramm-Kapitel geht verloren."
  },
  LOG_MESSAGES: {
    FORM_SUBMISSION_STARTED: 'WahlprogrammGenerator: Form submission started',
    GENERATING_CONTENT: 'Generating Wahlprogramm content, current step:',
    CONTENT_GENERATED: 'Wahlprogramm content generated, updating form data',
    FORM_DATA_UPDATED: 'Form data updated, new step:',
  }
};