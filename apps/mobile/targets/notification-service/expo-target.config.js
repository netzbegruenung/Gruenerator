/**
 * Notification Service Extension: decrypts the push content on the device.
 * APNs only ever carries ciphertext (`gp`) and a constant fallback alert; this
 * extension opens `gp` with the key the app stored in the shared keychain group
 * and replaces title and body before iOS shows the notification.
 *
 * The extension sees ONLY the push group, never the app's own keychain group
 * that holds the login token.
 *
 * @type {import('@bacons/apple-targets/app.plugin').ConfigFunction}
 */
module.exports = () => ({
  type: 'notification-service',
  name: 'NotificationService',
  bundleIdentifier: '.NotificationService',
  deploymentTarget: '16.4',
  entitlements: {
    'keychain-access-groups': ['$(AppIdentifierPrefix)de.gruenerator.app.push'],
  },
});
