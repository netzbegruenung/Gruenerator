const { withAppBuildGradle } = require('expo/config-plugins');

/**
 * Excludes *.map files from the packaged Android assets.
 *
 * `expo export:embed` writes the 'use dom' component web bundles into
 * assets/www.bundle including their source maps — the docs editor's map
 * alone is ~35MB of dead weight in every user download. aapt's
 * ignoreAssetsPattern drops them at packaging time.
 */
function withNoSourcemapAssets(config) {
  return withAppBuildGradle(config, (cfg) => {
    cfg.modResults.contents = cfg.modResults.contents.replace(
      /ignoreAssetsPattern '([^']*)'/,
      (match, pattern) =>
        String(pattern).includes('!*.map') ? match : `ignoreAssetsPattern '${String(pattern)}:!*.map'`
    );
    return cfg;
  });
}

module.exports = withNoSourcemapAssets;
