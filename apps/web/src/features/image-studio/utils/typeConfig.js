/**
 * Image Studio Type Configuration
 * Unified type system for Templates (sharepic) and KI (imagine) features
 */
import { HiPhotograph, HiSparkles, HiPencilAlt, HiHeart, HiPencil } from 'react-icons/hi';
import { PiLayout, PiTextT, PiQuotes, PiInfo, PiMagicWand, PiFolder, PiCalendar } from 'react-icons/pi';

// ============================================================================
// VARIANT SYSTEM
// Consolidated variant definitions - single source of truth for UI
// ============================================================================

/**
 * Base variant styles shared across PURE_CREATE and KI_SHAREPIC
 * Adding a new style here automatically makes it available to all variant types
 */
const VARIANT_STYLES = {
  illustration: { label: 'Illustration', imageName: 'soft-illustration.png' },
  realistic: { label: 'Realistisch', imageName: 'realistic-photo.png' },
  pixel: { label: 'Pixel Art', imageName: 'pixel-art.png' },
  editorial: { label: 'Editorial', imageName: 'editorial.png' }
};

/**
 * Variant type configurations
 * Maps style keys to API-expected values and image paths
 */
const VARIANT_TYPES = {
  pure: {
    basePath: '/imagine/variants-pure',
    // Maps style key to API value (backend expects these exact strings)
    valueMap: {
      illustration: 'illustration-pure',
      realistic: 'realistic-pure',
      pixel: 'pixel-pure',
      editorial: 'editorial-pure'
    }
  },
  sharepic: {
    basePath: '/imagine/variants',
    valueMap: {
      illustration: 'light-top',
      realistic: 'realistic-top',
      pixel: 'pixel-top',
      editorial: 'editorial'
    }
  }
};

/**
 * Creates variant array for a specific type
 * @param {string} variantType - 'pure' or 'sharepic'
 * @returns {Array} Variant objects ready for TYPE_CONFIG
 */
const createVariants = (variantType) => {
  const typeConfig = VARIANT_TYPES[variantType];
  if (!typeConfig) return [];

  return Object.entries(VARIANT_STYLES).map(([styleKey, { label, imageName }]) => ({
    value: typeConfig.valueMap[styleKey],
    label,
    imageUrl: `${typeConfig.basePath}/${imageName}`
  }));
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export const IMAGE_STUDIO_CATEGORIES = {
  TEMPLATES: 'templates',
  KI: 'ki'
};

export const KI_SUBCATEGORIES = {
  EDIT: 'edit',
  CREATE: 'create'
};

export const IMAGE_STUDIO_TYPES = {
  // Template types (canvas-based)
  DREIZEILEN: 'dreizeilen',
  ZITAT: 'zitat',
  ZITAT_PURE: 'zitat-pure',
  INFO: 'info',
  VERANSTALTUNG: 'veranstaltung',
  TEXT2SHAREPIC: 'text2sharepic',

  // KI types (FLUX API-based)
  GREEN_EDIT: 'green-edit',
  ALLY_MAKER: 'ally-maker',
  UNIVERSAL_EDIT: 'universal-edit',
  PURE_CREATE: 'pure-create',
  KI_SHAREPIC: 'ki-sharepic'
};

export const FORM_STEPS = {
  CATEGORY_SELECT: 'CATEGORY_SELECT',
  TYPE_SELECT: 'TYPE_SELECT',
  IMAGE_UPLOAD: 'IMAGE_UPLOAD',
  INPUT: 'INPUT',
  PREVIEW: 'PREVIEW',
  RESULT: 'RESULT'
};

export const TYPE_CONFIG = {
  // Template Types
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: {
    id: IMAGE_STUDIO_TYPES.DREIZEILEN,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Standard-Sharepic',
    description: 'Drei Textzeilen mit Hintergrundbild',
    icon: PiTextT,
    previewImage: '/imagine/previews/dreizeilen-preview.png',
    requiresImage: true,
    hasTextGeneration: true,
    usesFluxApi: false,
    hasRateLimit: false,
    inputBeforeImage: true,
    parallelPreload: true,
    endpoints: {
      text: '/dreizeilen_claude',
      canvas: '/dreizeilen_canvas'
    },
    formComponent: 'DreizeilenForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
    legacyType: 'Dreizeilen'
  },

  [IMAGE_STUDIO_TYPES.ZITAT]: {
    id: IMAGE_STUDIO_TYPES.ZITAT,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Zitat mit Bild',
    description: 'Zitat mit Hintergrundbild',
    icon: PiQuotes,
    previewImage: '/imagine/previews/zitat-preview.png',
    requiresImage: true,
    hasTextGeneration: true,
    usesFluxApi: false,
    hasRateLimit: false,
    endpoints: {
      text: '/zitat_claude',
      canvas: '/zitat_canvas'
    },
    formComponent: 'ZitatForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
    legacyType: 'Zitat'
  },

  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: {
    id: IMAGE_STUDIO_TYPES.ZITAT_PURE,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Zitat (Text)',
    description: 'Reines Text-Zitat ohne Bild',
    icon: PiQuotes,
    previewImage: '/imagine/previews/zitat-pure-preview.png',
    requiresImage: false,
    hasTextGeneration: true,
    usesFluxApi: false,
    hasRateLimit: false,
    endpoints: {
      text: '/zitat_pure_claude',
      canvas: '/zitat_pure_canvas'
    },
    formComponent: 'ZitatPureForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
    legacyType: 'Zitat_Pure'
  },

  [IMAGE_STUDIO_TYPES.INFO]: {
    id: IMAGE_STUDIO_TYPES.INFO,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Info-Sharepic',
    description: 'Strukturierte Info mit Header und Body',
    icon: PiInfo,
    previewImage: '/imagine/previews/info-preview.png',
    requiresImage: false,
    hasTextGeneration: true,
    usesFluxApi: false,
    hasRateLimit: false,
    endpoints: {
      text: '/info_claude',
      canvas: '/info_canvas'
    },
    formComponent: 'InfoForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
    legacyType: 'Info'
  },

  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: {
    id: IMAGE_STUDIO_TYPES.VERANSTALTUNG,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Veranstaltung',
    description: 'Event-Ankündigung mit Datum, Ort und Beschreibung',
    icon: PiCalendar,
    previewImage: '/imagine/previews/veranstaltung-preview.png',
    requiresImage: true,
    hasTextGeneration: true,
    usesFluxApi: false,
    hasRateLimit: false,
    endpoints: {
      text: '/veranstaltung_claude',
      canvas: '/veranstaltung_canvas'
    },
    steps: [FORM_STEPS.INPUT, FORM_STEPS.PREVIEW, FORM_STEPS.RESULT],
    legacyType: 'Veranstaltung'
  },

  [IMAGE_STUDIO_TYPES.TEXT2SHAREPIC]: {
    id: IMAGE_STUDIO_TYPES.TEXT2SHAREPIC,
    category: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Text zu Sharepic',
    description: 'KI generiert Sharepic aus Beschreibung',
    icon: PiMagicWand,
    requiresImage: false,
    hasTextGeneration: false,
    usesFluxApi: false,
    hasRateLimit: false,
    isBeta: true,
    endpoints: {
      generate: '/sharepic/text2sharepic/generate-ai'
    },
    formComponent: 'Text2SharepicForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    legacyType: 'Text2Sharepic'
  },

  // KI Types - Edit (require image upload)
  [IMAGE_STUDIO_TYPES.GREEN_EDIT]: {
    id: IMAGE_STUDIO_TYPES.GREEN_EDIT,
    category: IMAGE_STUDIO_CATEGORIES.KI,
    subcategory: KI_SUBCATEGORIES.EDIT,
    label: 'Grüne Straße',
    description: 'Verwandle Straßen in grüne Orte',
    icon: HiPhotograph,
    previewImage: '/imagine/green-street-example.png',
    requiresImage: true,
    hasTextGeneration: false,
    usesFluxApi: true,
    hasRateLimit: true,
    hasPrecisionMode: true,
    alwaysPrecision: true,
    endpoints: {
      generate: '/flux/green-edit/prompt'
    },
    formComponent: 'EditInstructionForm',
    steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    formProps: {
      label: 'Was soll grüner werden?',
      placeholder: 'Beschreibe detailliert, welche grüne Infrastruktur hinzugefügt werden soll. Z.B. Bäume, Fahrradwege, Solarpanels, Grünflächen...',
      helpText: 'Je detaillierter deine Beschreibung, desto besser das Ergebnis.',
      rows: 2
    },
    validation: {
      uploadedImage: { required: true, message: 'Bitte lade ein Bild hoch' },
      precisionInstruction: { required: true, minLength: 15, message: 'Bitte gib eine detaillierte Anweisung ein (min. 15 Zeichen)' }
    }
  },

  [IMAGE_STUDIO_TYPES.ALLY_MAKER]: {
    id: IMAGE_STUDIO_TYPES.ALLY_MAKER,
    category: IMAGE_STUDIO_CATEGORIES.KI,
    subcategory: KI_SUBCATEGORIES.EDIT,
    label: 'Ally Maker',
    description: 'Füge Regenbogen-Tattoos hinzu',
    icon: HiHeart,
    previewImage: '/imagine/variants/realistic-photo.png',
    hidden: true,
    requiresImage: true,
    hasTextGeneration: false,
    usesFluxApi: true,
    hasRateLimit: true,
    hasPrecisionMode: true,
    endpoints: {
      generate: '/flux/green-edit/prompt'
    },
    formComponent: 'AllyMakerForm',
    steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    placementOptions: [
      { value: 'Wange', label: 'Wange' },
      { value: 'Handgelenk', label: 'Handgelenk' },
      { value: 'Schlafe', label: 'Schläfe' },
      { value: 'Schulter', label: 'Schulter' }
    ]
  },

  [IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT]: {
    id: IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT,
    category: IMAGE_STUDIO_CATEGORIES.KI,
    subcategory: KI_SUBCATEGORIES.EDIT,
    label: 'Universell',
    description: 'Freie Bildbearbeitung mit KI',
    icon: HiPencil,
    previewImage: '/imagine/variants/editorial.png',
    requiresImage: true,
    hasTextGeneration: false,
    usesFluxApi: true,
    hasRateLimit: true,
    hasPrecisionMode: true,
    alwaysPrecision: true,
    endpoints: {
      generate: '/flux/green-edit/prompt'
    },
    formComponent: 'EditInstructionForm',
    steps: [FORM_STEPS.IMAGE_UPLOAD, FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    formProps: {
      label: 'Bearbeitungsanweisungen',
      placeholder: 'Beschreibe detailliert, wie das Bild bearbeitet werden soll. Z.B. "Ersetze den Himmel durch einen Sonnenuntergang" oder "Füge Nebel im Hintergrund hinzu"...',
      helpText: 'Erkläre genau, was geändert werden soll - je präziser, desto besser.',
      rows: 2
    },
    validation: {
      uploadedImage: { required: true, message: 'Bitte lade ein Bild hoch' },
      precisionInstruction: { required: true, minLength: 15, message: 'Bitte gib eine Bearbeitungsanweisung ein (min. 15 Zeichen)' }
    }
  },

  // KI Types - Create (no image required)
  [IMAGE_STUDIO_TYPES.PURE_CREATE]: {
    id: IMAGE_STUDIO_TYPES.PURE_CREATE,
    category: IMAGE_STUDIO_CATEGORIES.KI,
    subcategory: KI_SUBCATEGORIES.CREATE,
    label: 'Bild erstellen',
    description: 'Erstelle ein neues Bild aus Text',
    icon: HiSparkles,
    previewImage: '/imagine/variants-pure/soft-illustration.png',
    requiresImage: false,
    hasTextGeneration: false,
    usesFluxApi: true,
    hasRateLimit: true,
    endpoints: {
      generate: '/imagine/pure'
    },
    formComponent: 'PureCreateForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    variants: createVariants('pure'),
    validation: {
      purePrompt: { required: true, minLength: 5, message: 'Bitte beschreibe dein Bild (min. 5 Zeichen)' }
    }
  },

  [IMAGE_STUDIO_TYPES.KI_SHAREPIC]: {
    id: IMAGE_STUDIO_TYPES.KI_SHAREPIC,
    category: IMAGE_STUDIO_CATEGORIES.KI,
    subcategory: KI_SUBCATEGORIES.CREATE,
    label: 'KI-Sharepic',
    description: 'KI-Bild mit Titel-Overlay',
    icon: HiPhotograph,
    previewImage: '/imagine/variants-pure/editorial.png',
    hidden: true,
    requiresImage: false,
    hasTextGeneration: false,
    usesFluxApi: true,
    hasRateLimit: true,
    endpoints: {
      generate: '/imagine/create'
    },
    formComponent: 'KiSharepicForm',
    steps: [FORM_STEPS.INPUT, FORM_STEPS.RESULT],
    variants: createVariants('sharepic'),
    validation: {
      sharepicPrompt: { required: true, minLength: 5, message: 'Bitte beschreibe dein Bild (min. 5 Zeichen)' }
    }
  }
};

export const CATEGORY_CONFIG = {
  [IMAGE_STUDIO_CATEGORIES.TEMPLATES]: {
    id: IMAGE_STUDIO_CATEGORIES.TEMPLATES,
    label: 'Templates',
    subtitle: 'Design-basiert',
    description: 'Erstelle Sharepics mit vorgefertigten Designs',
    icon: PiLayout,
    types: Object.values(TYPE_CONFIG)
      .filter(t => t.category === IMAGE_STUDIO_CATEGORIES.TEMPLATES && !t.hidden)
      .map(t => t.id)
  },
  [IMAGE_STUDIO_CATEGORIES.KI]: {
    id: IMAGE_STUDIO_CATEGORIES.KI,
    label: 'KI-Powered',
    subtitle: 'AI-generiert',
    description: 'Erstelle und bearbeite Bilder mit künstlicher Intelligenz',
    icon: HiSparkles,
    hasRateLimit: true,
    hasSubcategories: true,
    types: Object.values(TYPE_CONFIG)
      .filter(t => t.category === IMAGE_STUDIO_CATEGORIES.KI && !t.hidden)
      .map(t => t.id)
  }
};

export const KI_SUBCATEGORY_CONFIG = {
  [KI_SUBCATEGORIES.EDIT]: {
    id: KI_SUBCATEGORIES.EDIT,
    label: 'Mit KI Editieren',
    description: 'Bestehende Bilder mit KI bearbeiten',
    icon: HiPencilAlt,
    previewImage: '/imagine/green-street-example.png'
  },
  [KI_SUBCATEGORIES.CREATE]: {
    id: KI_SUBCATEGORIES.CREATE,
    label: 'Mit KI Generieren',
    description: 'Neue Bilder aus Text erstellen',
    icon: HiSparkles,
    previewImage: '/imagine/variants-pure/soft-illustration.png'
  }
};

/**
 * Template Field Configuration
 * Config-driven field definitions for template types
 * Used by TemplateStudioFlow for rendering forms without hardcoded type checks
 */
export const TEMPLATE_FIELD_CONFIG = {
  [IMAGE_STUDIO_TYPES.DREIZEILEN]: {
    inputFields: [
      { name: 'thema', type: 'textarea', label: 'Thema & Details', subtitle: 'Beschreibe dein Thema für die Texterstellung durch KI', placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...', required: true, minLength: 3 }
    ],
    previewFields: [
      { name: 'line1', type: 'text', label: 'Zeile 1' },
      { name: 'line2', type: 'text', label: 'Zeile 2' },
      { name: 'line3', type: 'text', label: 'Zeile 3' }
    ],
    resultFields: ['line1', 'line2', 'line3'],
    responseMapping: (result) => ({
      line1: result.mainSlogan?.line1 || '',
      line2: result.mainSlogan?.line2 || '',
      line3: result.mainSlogan?.line3 || '',
      searchTerms: result.searchTerms || []
    }),
    alternativesMapping: (alt) => ({
      line1: alt.line1 || '',
      line2: alt.line2 || '',
      line3: alt.line3 || ''
    }),
    showImageUpload: true,
    showColorControls: true,
    showFontSizeControl: true,
    showAdvancedEditing: true,
    showCredit: true,
    showAlternatives: true,
    showEditPanel: true,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: false,
    alternativesButtonText: 'Anderer Slogan'
  },

  [IMAGE_STUDIO_TYPES.ZITAT]: {
    inputFields: [
      { name: 'thema', type: 'textarea', label: 'Thema & Details', subtitle: 'Beschreibe das Thema, zu dem ein Zitat erstellt werden soll', placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...', required: true, minLength: 3 },
      { name: 'name', type: 'text', label: 'Zitiert wird', subtitle: 'Die Person oder die Position, von der das Zitat stammt', placeholder: 'Maxi Mustermensch', required: true }
    ],
    previewFields: [
      { name: 'quote', type: 'textarea', label: 'Zitat' }
    ],
    resultFields: ['quote'],
    responseMapping: (result) => ({
      quote: result.quote || ''
    }),
    alternativesMapping: (alt) => ({
      quote: alt.quote || ''
    }),
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    showEditPanel: true,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: false,
    alternativesButtonText: 'Andere Zitate'
  },

  [IMAGE_STUDIO_TYPES.ZITAT_PURE]: {
    inputFields: [
      { name: 'thema', type: 'textarea', label: 'Thema & Details', subtitle: 'Beschreibe das Thema, zu dem ein Text-Zitat erstellt werden soll', placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...', required: true, minLength: 3 },
      { name: 'name', type: 'text', label: 'Zitiert wird', subtitle: 'Die Person oder die Position, von der das Zitat stammt', placeholder: 'Maxi Mustermensch', required: true }
    ],
    previewFields: [
      { name: 'quote', type: 'textarea', label: 'Zitat' }
    ],
    resultFields: ['quote'],
    responseMapping: (result) => ({
      quote: result.quote || ''
    }),
    alternativesMapping: (alt) => ({
      quote: alt.quote || ''
    }),
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    showEditPanel: true,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: false,
    alternativesButtonText: 'Andere Zitate'
  },

  [IMAGE_STUDIO_TYPES.INFO]: {
    inputFields: [
      { name: 'thema', type: 'textarea', label: 'Thema & Details', subtitle: 'Beschreibe dein Info-Thema für eine strukturierte Darstellung', placeholder: 'Beschreibe dein Thema, z.B. Klimaschutz mit Fokus auf erneuerbare Energien...', required: true, minLength: 3 }
    ],
    previewFields: [
      { name: 'header', type: 'text', label: 'Header' },
      { name: 'subheader', type: 'text', label: 'Subheader' },
      { name: 'body', type: 'textarea', label: 'Body' }
    ],
    resultFields: ['header', 'subheader', 'body'],
    responseMapping: (result) => ({
      header: result.header || '',
      subheader: result.subheader || '',
      body: result.body || '',
      searchTerms: result.searchTerms || []
    }),
    alternativesMapping: (alt) => ({
      header: alt.header || '',
      subheader: alt.subheader || '',
      body: alt.body || ''
    }),
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    showEditPanel: true,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: false,
    alternativesButtonText: 'Andere Varianten'
  },

  [IMAGE_STUDIO_TYPES.VERANSTALTUNG]: {
    inputFields: [
      {
        name: 'thema',
        type: 'textarea',
        label: 'Event-Beschreibung',
        subtitle: 'Beschreibe die Veranstaltung - Thema, Datum, Uhrzeit, Ort',
        placeholder: 'z.B. Klimaschutz-Diskussion am 15. Januar 2025 um 19 Uhr im Rathaus Musterstadt, Hauptstraße 1',
        required: true,
        rows: 3
      }
    ],
    previewFields: [
      { name: 'eventTitle', type: 'text', label: 'Event-Titel', placeholder: 'z.B. DISKUSSION' },
      { name: 'beschreibung', type: 'textarea', label: 'Beschreibung', placeholder: 'z.B. Gemeinsam für mehr Klimaschutz in unserer Stadt!', rows: 2 },
      { name: 'weekday', type: 'text', label: 'Wochentag (im Kreis)', placeholder: 'z.B. MI' },
      { name: 'date', type: 'text', label: 'Datum (im Kreis)', placeholder: 'z.B. 15.01.' },
      { name: 'time', type: 'text', label: 'Uhrzeit (im Kreis)', placeholder: 'z.B. 19 UHR' },
      { name: 'locationName', type: 'text', label: 'Veranstaltungsort', placeholder: 'z.B. Rathaus Musterstadt' },
      { name: 'address', type: 'text', label: 'Adresse', placeholder: 'z.B. Hauptstraße 1, 12345 Musterstadt' }
    ],
    showPreviewLabels: true,
    resultFields: ['eventTitle', 'beschreibung', 'weekday', 'date', 'time', 'locationName', 'address'],
    responseMapping: (result) => ({
      eventTitle: result.mainEvent?.eventTitle || result.eventTitle || '',
      beschreibung: result.mainEvent?.beschreibung || result.beschreibung || '',
      weekday: result.mainEvent?.weekday || result.weekday || '',
      date: result.mainEvent?.date || result.date || '',
      time: result.mainEvent?.time || result.time || '',
      locationName: result.mainEvent?.locationName || result.locationName || '',
      address: result.mainEvent?.address || result.address || ''
    }),
    alternativesMapping: (alt) => ({
      eventTitle: alt.eventTitle || '',
      beschreibung: alt.beschreibung || '',
      weekday: alt.weekday || '',
      date: alt.date || '',
      time: alt.time || '',
      locationName: alt.locationName || '',
      address: alt.address || ''
    }),
    showImageUpload: true,
    showColorControls: false,
    showFontSizeControl: true,
    showGroupedFontSizeControl: true,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: true,
    showEditPanel: true,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: false,
    skipSloganStep: false
  },

  // KI Types - Config-driven with StepFlow wizard
  [IMAGE_STUDIO_TYPES.GREEN_EDIT]: {
    inputFields: [
      {
        name: 'precisionInstruction',
        type: 'textarea',
        label: 'Was soll grüner werden?',
        subtitle: 'Beschreibe, welche grünen Elemente hinzugefügt werden sollen (z.B. Bäume, Fahrradwege, Grünflächen)',
        placeholder: 'Beschreibe detailliert, welche grüne Infrastruktur hinzugefügt werden soll. Z.B. Bäume, Fahrradwege, Solarpanels, Grünflächen...',
        helpText: 'Je detaillierter deine Beschreibung, desto besser das Ergebnis.',
        required: true,
        minLength: 15,
        rows: 2
      }
    ],
    previewFields: [],
    resultFields: [],
    skipSloganStep: true,
    afterLastInputTrigger: 'generateImage',
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: true
  },

  [IMAGE_STUDIO_TYPES.ALLY_MAKER]: {
    inputFields: [
      {
        name: 'allyPlacement',
        type: 'select',
        label: 'Wo soll das Tattoo erscheinen?',
        subtitle: 'Wähle die Position aus, wo das Regenbogen-Tattoo auf der Person platziert werden soll',
        placeholder: 'Wähle eine Position...',
        required: true,
        options: [
          { value: 'Wange', label: 'Wange' },
          { value: 'Handgelenk', label: 'Handgelenk' },
          { value: 'Schlafe', label: 'Schläfe' },
          { value: 'Schulter', label: 'Schulter' }
        ]
      }
    ],
    previewFields: [],
    resultFields: [],
    skipSloganStep: true,
    afterLastInputTrigger: 'generateImage',
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: true
  },

  [IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT]: {
    inputFields: [
      {
        name: 'precisionInstruction',
        type: 'textarea',
        label: 'Bearbeitungsanweisungen',
        subtitle: 'Sag der KI genau, was am Bild geändert werden soll (z.B. Himmel ändern, Objekte hinzufügen)',
        placeholder: 'Beschreibe detailliert, wie das Bild bearbeitet werden soll. Z.B. "Ersetze den Himmel durch einen Sonnenuntergang" oder "Füge Nebel im Hintergrund hinzu"...',
        helpText: 'Erkläre genau, was geändert werden soll - je präziser, desto besser.',
        required: true,
        minLength: 15,
        rows: 2
      }
    ],
    previewFields: [],
    resultFields: [],
    skipSloganStep: true,
    afterLastInputTrigger: 'generateImage',
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: true
  },

  [IMAGE_STUDIO_TYPES.PURE_CREATE]: {
    inputFields: [
      {
        name: 'purePrompt',
        type: 'textarea',
        label: 'Bildbeschreibung',
        subtitle: 'Beschreibe dein Wunschbild so detailliert wie möglich. Umso präziser, umso besser das Ergebnis!',
        placeholder: 'Schreibe hier...',
        required: true,
        minLength: 5,
        maxLength: 500,
        rows: 1
      }
    ],
    previewFields: [],
    resultFields: [],
    skipSloganStep: true,
    afterLastInputTrigger: 'generateImage',
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: true
  },

  [IMAGE_STUDIO_TYPES.KI_SHAREPIC]: {
    inputFields: [
      {
        name: 'sharepicPrompt',
        type: 'textarea',
        label: 'Bildbeschreibung',
        subtitle: 'Was soll auf dem Bild zu sehen sein? Beschreibe Objekte, Farben, Atmosphäre und Stil.',
        placeholder: 'Beschreibe das Bild...',
        required: true,
        minLength: 5,
        maxLength: 500,
        rows: 1
      },
      {
        name: 'imagineTitle',
        type: 'text',
        label: 'Titel',
        subtitle: 'Ein aussagekräftiger Titel, der über dem Bild eingeblendet wird (optional)',
        placeholder: 'Titel für das Sharepic...',
        required: false
      }
    ],
    previewFields: [],
    resultFields: [],
    skipSloganStep: true,
    afterLastInputTrigger: 'generateImage',
    showImageUpload: false,
    showColorControls: false,
    showFontSizeControl: false,
    showAdvancedEditing: false,
    showCredit: false,
    showAlternatives: false,
    showEditPanel: false,
    showAutoSave: true,
    showSocialGeneration: true,
    minimalLayout: true
  }
};

export const getTemplateFieldConfig = (typeId) => TEMPLATE_FIELD_CONFIG[typeId] || null;

export const getTypeConfig = (typeId) => TYPE_CONFIG[typeId] || null;

export const getCategoryConfig = (categoryId) => CATEGORY_CONFIG[categoryId] || null;

export const getTypesForCategory = (categoryId) => {
  const category = CATEGORY_CONFIG[categoryId];
  if (!category) return [];
  return category.types.map(typeId => TYPE_CONFIG[typeId]).filter(t => !t.hidden);
};

export const getTypesForSubcategory = (subcategoryId) => {
  return Object.values(TYPE_CONFIG)
    .filter(t => t.subcategory === subcategoryId && !t.hidden);
};

export const getSubcategoryConfig = (subcategoryId) => KI_SUBCATEGORY_CONFIG[subcategoryId] || null;

export const getLegacyType = (typeId) => {
  const config = TYPE_CONFIG[typeId];
  return config?.legacyType || null;
};

export const getTypeFromLegacy = (legacyType) => {
  const entry = Object.entries(TYPE_CONFIG).find(([_, config]) => config.legacyType === legacyType);
  return entry ? entry[0] : null;
};

export const URL_TYPE_MAP = {
  'dreizeilen': IMAGE_STUDIO_TYPES.DREIZEILEN,
  'zitat': IMAGE_STUDIO_TYPES.ZITAT,
  'zitat-pure': IMAGE_STUDIO_TYPES.ZITAT_PURE,
  'info': IMAGE_STUDIO_TYPES.INFO,
  'veranstaltung': IMAGE_STUDIO_TYPES.VERANSTALTUNG,
  'text2sharepic': IMAGE_STUDIO_TYPES.TEXT2SHAREPIC,
  'ki': IMAGE_STUDIO_TYPES.TEXT2SHAREPIC,
  'green-edit': IMAGE_STUDIO_TYPES.GREEN_EDIT,
  'ally-maker': IMAGE_STUDIO_TYPES.ALLY_MAKER,
  'universal-edit': IMAGE_STUDIO_TYPES.UNIVERSAL_EDIT,
  'pure-create': IMAGE_STUDIO_TYPES.PURE_CREATE,
  'ki-sharepic': IMAGE_STUDIO_TYPES.KI_SHAREPIC
};

export default {
  IMAGE_STUDIO_CATEGORIES,
  IMAGE_STUDIO_TYPES,
  KI_SUBCATEGORIES,
  FORM_STEPS,
  TYPE_CONFIG,
  CATEGORY_CONFIG,
  KI_SUBCATEGORY_CONFIG,
  TEMPLATE_FIELD_CONFIG,
  getTypeConfig,
  getCategoryConfig,
  getTypesForCategory,
  getTypesForSubcategory,
  getSubcategoryConfig,
  getTemplateFieldConfig,
  getLegacyType,
  getTypeFromLegacy,
  URL_TYPE_MAP
};
