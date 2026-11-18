/**
 * Over-the-air updates come from our own xprem server (expo-open-ota), not from
 * EAS Update: an update check against u.expo.dev sends every device's IP to a US
 * provider (#3904).
 *
 * Only builds that name a RELEASE_CHANNEL (the `preview` and `production`
 * profiles in eas.json) get the update config, for two reasons:
 * - EAS Build writes `expo-channel-name` only when `updates.url` points at
 *   u.expo.dev (`isEASUpdateConfigured` in @expo/build-tools), so for our own
 *   server the channel has to come from here.
 * - A dev client with an embedded certificate asks Metro for signed manifests,
 *   and `expo start` then refuses to run without the private key.
 *
 * `eoas publish` reads the same variable, so an update is exported with the
 * config of the channel it is published for.
 */
const OTA_MANIFEST_URL = 'https://ota.moritz-waechter.de/manifest';
// App ID of the `Gruenerator` app in the xprem dashboard (App Info).
const XPREM_APP_ID = '9af925be-1aa5-426b-98c2-855300438cb3';

/**
 * FCM needs `google-services.json` in the Android build. It is an EAS file
 * variable (`GOOGLE_SERVICES_JSON`), not a committed file: the repo is public
 * and the file names the Firebase project. Without it the build still works,
 * Android push is just unavailable.
 */
function withGoogleServices(config) {
  const file = process.env.GOOGLE_SERVICES_JSON;
  return file ? { ...config, android: { ...config.android, googleServicesFile: file } } : config;
}

module.exports = ({ config: base }) => {
  const config = withGoogleServices(base);
  const channel = process.env.RELEASE_CHANNEL;
  if (!channel) {
    return { ...config, updates: { ...config.updates, enabled: false } };
  }

  return {
    ...config,
    updates: {
      ...config.updates,
      enabled: true,
      url: OTA_MANIFEST_URL,
      codeSigningCertificate: './certs/certificate.pem',
      codeSigningMetadata: { keyid: 'main', alg: 'rsa-v1_5-sha256' },
      // expo-updates only sends headers declared at build time. `xprem-branch`
      // stays declared (empty) so branch surfing works later without a rebuild.
      requestHeaders: {
        'expo-channel-name': channel,
        'expo-app-id': XPREM_APP_ID,
        'xprem-branch': '',
      },
    },
  };
};
