const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

/**
 * Keeps Firebase silent until the person opts in to push.
 *
 * With `google-services.json` in the build, Firebase Messaging would mint an
 * FCM token (a request to Google) on every app start. Auto-init off moves
 * that to the explicit `getDevicePushTokenAsync()` call behind the opt-in
 * switch. Analytics is not linked at all; the flag is set anyway because
 * Firebase only skips auto registration when both are off.
 */
function withFcmNoAutoInit(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'firebase_messaging_auto_init_enabled',
      'false'
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'firebase_analytics_collection_enabled',
      'false'
    );
    return cfg;
  });
}

module.exports = withFcmNoAutoInit;
