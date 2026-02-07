import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.gruenerator.app',
  appName: 'Grünerator',
  webDir: '../web/build',
  server: {
    // Android: Use 10.0.2.2 to reach host machine from emulator
    // iOS Simulator: Use localhost
    // For production: Remove this or use your actual API URL
    url: process.env.NODE_ENV === 'development' ? 'http://10.0.2.2:3000' : undefined,
    cleartext: process.env.NODE_ENV === 'development',
  },
  ios: {
    scheme: 'gruenerator',
    contentInset: 'automatic',
  },
  android: {
    allowMixedContent: process.env.NODE_ENV === 'development',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#FFFFFF',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
    Browser: {
      // Handle OAuth callbacks
    },
  },
};

export default config;
