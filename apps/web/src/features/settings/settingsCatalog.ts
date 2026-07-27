/**
 * The row-label catalog now lives in `@gruenerator/shared/settings`, because
 * mobile renders a deliberate subset of the same settings and needs the same
 * wording. See that file for the rationale and for the `platforms` field.
 *
 * This module stays as the web-side entry point so the tabs keep importing from
 * one place.
 */
export {
  SETTINGS_CATALOG,
  getSettingsEntry,
  settingsForPlatform,
  type SettingsCatalogEntry,
} from '@gruenerator/shared/settings';
