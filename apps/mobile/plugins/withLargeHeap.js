const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Sets android:largeHeap="true" on the <application>.
 *
 * The app streams and edits large videos (reel pipeline: ExoPlayer playback
 * with read-ahead buffering + okhttp HTTP/2 windows + on-device compression).
 * The default 256MB Java heap OOMs mid-edit on video-heavy screens
 * (java.lang.OutOfMemoryError in okio while the subtitle editor loops a
 * ~90MB video). largeHeap raises the cap to the device's large-heap size
 * (typically 512MB).
 */
function withLargeHeap(config) {
  return withAndroidManifest(config, (cfg) => {
    const application = cfg.modResults.manifest.application?.[0];
    if (application) {
      application.$['android:largeHeap'] = 'true';
    }
    return cfg;
  });
}

module.exports = withLargeHeap;
