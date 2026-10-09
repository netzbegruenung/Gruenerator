export {
  SETTINGS_CATALOG,
  getSettingsEntry,
  settingsForPlatform,
  type SettingsCatalogEntry,
  type SettingsPlatform,
  type SettingsTab,
} from './catalog.js';
export {
  CHAT_BACKGROUND_FAMILIES,
  CHAT_BACKGROUND_PRESETS,
  DEFAULT_CHAT_BACKGROUND,
  DEFAULT_CHAT_BACKGROUND_MOBILE,
  chatBackgroundsFor,
  resolveChatBackground,
  type ChatBackgroundFamily,
  type ChatBackgroundPlatform,
  type ChatBackgroundPreset,
} from './chatBackgrounds.js';
export {
  DEFAULT_TTS_VOICE_ID,
  TTS_VOICES,
  TTS_VOICE_AGE_LABEL,
  ttsVoiceLabel,
  ttsVoiceSampleUrl,
  type TtsVoice,
  type TtsVoiceAge,
  type TtsVoiceReading,
} from './ttsVoices.js';
