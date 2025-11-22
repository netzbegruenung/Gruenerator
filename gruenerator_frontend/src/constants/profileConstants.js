// Profile management constants

export const MAX_CONTENT_LENGTH = 1000;
export const MAX_KNOWLEDGE_ENTRIES = 3;
export const GROUP_MAX_CONTENT_LENGTH = 1000;

// Auth URLs
export const AUTH_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

// Common error messages
export const ERROR_MESSAGES = {
    UNKNOWN_ERROR: 'Ein unbekannter Fehler ist aufgetreten.',
    SAVE_ERROR: 'Fehler beim Speichern',
    DELETE_ERROR: 'Fehler beim Löschen',
    LOAD_ERROR: 'Fehler beim Laden der Daten',
    AUTH_REQUIRED: 'Benutzer nicht authentifiziert',
    MEMORY_LOAD_ERROR: 'Fehler beim Laden der Memories',
    MEMORY_ADD_ERROR: 'Fehler beim Hinzufügen der Memory',
    MEMORY_DELETE_ERROR: 'Fehler beim Löschen der Memory',
    GROUP_CREATE_ERROR: 'Gruppe konnte nicht erstellt werden.',
    GROUP_DELETE_ERROR: 'Fehler beim Löschen der Gruppe',
    DOCUMENT_DELETE_ERROR: 'Fehler beim Löschen des Dokuments',
    TEXT_UPDATE_ERROR: 'Fehler beim Aktualisieren des Texttitels'
};

// Success messages
export const SUCCESS_MESSAGES = {
    SAVE_SUCCESS: 'Erfolgreich gespeichert!',
    DELETE_SUCCESS: 'Erfolgreich gelöscht!',
    MEMORY_ADDED: 'Memory erfolgreich hinzugefügt',
    MEMORY_DELETED: 'Memory erfolgreich gelöscht',
    GROUP_CREATED: 'Gruppe erfolgreich erstellt!',
    GROUP_DELETED: 'Gruppe erfolgreich gelöscht!',
    DOCUMENT_DELETED: 'Dokument wurde erfolgreich gelöscht.',
    TEXT_UPDATED: 'Texttitel erfolgreich aktualisiert.'
};

// Tab configurations
export const CONTENT_MANAGEMENT_TABS = [
    { key: 'canva', label: 'Canva' },
    { key: 'documents', label: 'Dokumente & Texte' }
];

export const CANVA_SUBTABS = [
    { key: 'overview', label: 'Übersicht' },
    { key: 'vorlagen', label: 'Canva Vorlagen' },
    { key: 'assets', label: 'Assets' }
];

export const DOCUMENTS_SUBTABS = [
    { key: 'documents', label: 'Meine Dokumente' },
    { key: 'texts', label: 'Meine Texte' },
    { key: 'qa', label: 'Meine Notebooks' }
];

// Form validation
export const VALIDATION_RULES = {
    KNOWLEDGE_TITLE: {
        maxLength: { value: 100, message: 'Titel darf maximal 100 Zeichen haben' }
    },
    GROUP_NAME: {
        maxLength: { value: 100, message: 'Gruppenname darf maximal 100 Zeichen haben' }
    }
};