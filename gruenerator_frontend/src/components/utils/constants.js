export const SHAREPIC_TYPES = {
  QUOTE: 'Zitat',
  THREE_LINES: 'Dreizeilen'
};

export const FORM_STEPS = {
  INPUT: 0,
  PREVIEW: 1,
  RESULT: 2
};

export const FONT_SIZES = {
  s: 90,
  m: 100,
  l: 110,


};

export const MAX_FONT_SIZE = 120;
export const MIN_FONT_SIZE = 80;

export const VALIDATION_MESSAGES = {
  REQUIRED_THEME: 'Thema ist erforderlich',
  REQUIRED_TYPE: 'Typ ist erforderlich',
  REQUIRED_FIELD: 'Dieses Feld ist erforderlich.',
  INVALID_FILE_TYPE: 'Ungültiger Dateityp.',
  FILE_UPLOAD_FAILED: 'Datei-Upload fehlgeschlagen.'
};

export const BUTTON_LABELS = {
  GENERATE_TEXT: 'Text Grünerieren',
  GENERATE_IMAGE: 'Bild Grünerieren',
  UPLOAD_FILE: 'Datei hochladen',
  SUBMIT: 'Absenden',
  CHANGE_FILE: 'Ändern',
  BACK: 'Zurück',
  DOWNLOAD: 'Download',
  COPY: 'Kopieren',
  REGENERATE_TEXT: 'Text neu-Grünerieren',
  MENU: 'Menü',
  CLOSE_MENU: 'Menü schließen',
  UNSPLASH_SELECT: 'Zufälliges Naturbild von Unsplash'

};

export const ARIA_LABELS = {
  BACK: 'Zurück zum vorherigen Schritt',
  SUBMIT: 'Formular absenden',
  DOWNLOAD: 'Generiertes Bild herunterladen',
  GENERATE_POST: 'Beitragstext generieren',
  COPY: 'Generierten Text kopieren',
  REGENERATE_TEXT: 'Neuen Beitragstext generieren',
  TOGGLE_DARK_MODE: 'Dunkelmodus umschalten'
};

export const ANNOUNCEMENTS = {
  GENERATING_TEXT: 'Generiere Beitragstext...',
  TEXT_GENERATED: 'Beitragstext wurde erfolgreich generiert.',
  TEXT_GENERATION_ERROR: 'Fehler beim Generieren des Beitragstexts.',
  TEXT_COPIED: 'Text wurde in die Zwischenablage kopiert.',
  UNSPLASH_SELECT: 'Zufälliges Naturbild von Unsplash auswählen',
  UNSPLASH_IMAGE_LOADING: "Lade zufälliges Bild von Unsplash...",
  UNSPLASH_IMAGE_LOADED: "Bild von Unsplash erfolgreich geladen",
  UNSPLASH_IMAGE_ERROR: "Fehler beim Laden des Bildes von Unsplash",

};

export const UI_ELEMENTS = {
  MODIFIED_IMAGE: 'Modifiziertes Bild',
  GENERATED_SHAREPIC: 'Generiertes Sharepic',
  FOOTER: 'Fußzeile',
  HEADER: 'Kopfzeile',
  NAV_MENU: 'Navigationsmenü'
};

export const ERROR_MESSAGES = {
  NO_IMAGE_DATA: 'Keine Bilddaten empfangen',
  TYPE: 'Sharepic-Typ ist erforderlich.',
  THEMA: 'Thema ist erforderlich.',
  DETAILS: 'Details sind erforderlich.',
  QUOTE: 'Zitat ist erforderlich.',
  NAME: 'Name ist erforderlich.',
  LINE1: 'Zeile 1 ist erforderlich.',
  LINE2: 'Zeile 2 ist erforderlich.',
  LINE3: 'Zeile 3 ist erforderlich.'
};

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
  TYPE: 'Sharepic-Typ'
};

export const FORM_PLACEHOLDERS = {
  THEME: 'Gib das Thema ein...',
  QUOTE: 'Gib ein Zitat ein...',
  NAME: 'Gib den Namen ein...',
  LINE1: 'Gib die erste Zeile ein...',
  LINE2: 'Gib die zweite Zeile ein...',
  LINE3: 'Gib die dritte Zeile ein...',
  FILE_UPLOAD: 'Wähle eine Datei...',
  IDEE: 'Worum gehts?',
  DETAILS: 'Details zur Initiative, beteiligte Personen und geplante Aktionen.',
  GLIEDERUNG: 'Grüne Fraktion Musterdorf',
  DRAG_AND_DROP: 'Ziehe eine Datei hierher oder klicke, um eine Datei auszuwählen',
  WHAT: 'Initiative für mehr Grünflächen in der Stadt',
  DETAILS_ALL: 'Durch Baumpflanzaktionen, neue Parks und grüne Dachflächen in Kooperation mit lokalen Schulen und Unternehmen.',
  WHO_QUOTE: 'Alex Schmidt, Sprecher*in der Grünen OV Musterdorf',
  PRESS_CONTACT: 'Alex Schmidt, Sprecher*in, 01234 567890, alex.schmidt@gruene-musterdorf.de',
  TYPE: 'Bitte wählen'
};

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
          { LINK: '/antragsgenerator', TEXT: 'Anträge', ICON: 'PiFileText' },
          { LINK: '/pressemitteilung', TEXT: 'Pressemitteilungen', ICON: 'PiNewspaper' },
          { LINK: '/socialmedia', TEXT: 'Social Media', ICON: 'PiChatsCircle' },
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
