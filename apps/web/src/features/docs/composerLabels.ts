export const COMPOSER_LABELS = [
  { id: 'import', label: 'Importieren' },
  { id: 'photo-upload', label: 'Foto hochladen …' },
] as const;

export const IMPORT_LABEL = COMPOSER_LABELS[0].label;
export const PHOTO_UPLOAD_LABEL = COMPOSER_LABELS[1].label;
