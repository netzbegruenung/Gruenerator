const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

/**
 * Declares HEVC/HDR media capabilities in the Android manifest.
 *
 * Without this, Android 12+ "compatible media transcoding" re-encodes
 * HEVC/HDR videos (the Samsung camera default) to AVC/SDR whenever the app
 * opens them via MediaStore or the photo picker — shown to the user as an
 * endless "Ausgewählte Medien werden vorbereitet…" dialog for long videos.
 * Declaring support hands the app the original file untouched; the reel
 * pipeline handles HEVC fine (on-device compressor re-encodes to H.264,
 * backend uses ffmpeg).
 *
 * https://developer.android.com/media/platform/transcoding-compatible-media
 */
const MEDIA_CAPABILITIES_XML = `<?xml version="1.0" encoding="utf-8"?>
<media-capabilities xmlns:android="http://schemas.android.com/apk/res/android">
    <format android:name="HEVC" supported="true"/>
    <format android:name="HDR10" supported="true"/>
    <format android:name="HDR10Plus" supported="true"/>
</media-capabilities>
`;

function withMediaCapabilities(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const resXmlDir = path.join(cfg.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(resXmlDir, { recursive: true });
      fs.writeFileSync(path.join(resXmlDir, 'media_capabilities.xml'), MEDIA_CAPABILITIES_XML);
      return cfg;
    },
  ]);

  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.property = application.property ?? [];
      const alreadyDeclared = application.property.some(
        (p) => p.$['android:name'] === 'android.media.PROPERTY_MEDIA_CAPABILITIES'
      );
      if (!alreadyDeclared) {
        application.property.push({
          $: {
            'android:name': 'android.media.PROPERTY_MEDIA_CAPABILITIES',
            'android:resource': '@xml/media_capabilities',
          },
        });
      }
    }
    return cfg;
  });
}

module.exports = withMediaCapabilities;
