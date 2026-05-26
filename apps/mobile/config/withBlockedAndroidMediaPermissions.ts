import { withAndroidManifest, type ConfigPlugin, type AndroidConfig } from 'expo/config-plugins';

/**
 * Broad media-read permissions that expo-media-library's native module manifest
 * merges in. The app only writes to the gallery (write-only saves) and picks via
 * the Android Photo Picker, so Google Play's Photo & Video Permissions policy
 * forbids declaring these. Stripping them is required to pass Play review.
 */
const BLOCKED_PERMISSIONS = [
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_MEDIA_VIDEO',
  'android.permission.READ_MEDIA_AUDIO',
  'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
  'android.permission.ACCESS_MEDIA_LOCATION',
];

type UsesPermission = AndroidConfig.Manifest.ManifestUsesPermission;

/**
 * Removes the blocked permissions and re-declares each with `tools:node="remove"`,
 * which instructs the Android manifest merger to delete the node from the final
 * merged manifest even though a dependency's manifest declares it.
 */
const withBlockedAndroidMediaPermissions: ConfigPlugin = (config) =>
  withAndroidManifest(config, (cfg) => {
    const { manifest } = cfg.modResults;
    manifest.$['xmlns:tools'] ??= 'http://schemas.android.com/tools';

    const existing = manifest['uses-permission'] ?? [];
    const kept = existing.filter(
      (permission) => !BLOCKED_PERMISSIONS.includes(permission.$['android:name'] ?? '')
    );

    const removals = BLOCKED_PERMISSIONS.map(
      (name): UsesPermission => ({ $: { 'android:name': name, 'tools:node': 'remove' } })
    );

    manifest['uses-permission'] = [...kept, ...removals];
    return cfg;
  });

export default withBlockedAndroidMediaPermissions;
