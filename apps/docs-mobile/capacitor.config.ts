import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.gruenerator.docs',
  appName: 'Grünerator Docs',
  webDir: 'dist',
  server: {
    // Android emulator: 10.0.2.2 reaches host machine
    url: process.env.NODE_ENV === 'development' ? 'http://10.0.2.2:3003' : undefined,
    cleartext: process.env.NODE_ENV === 'development',
  },
  ios: {
    scheme: 'gruenerator-docs',
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
