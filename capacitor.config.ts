import type { CapacitorConfig } from '@capacitor/cli';

// CLOUT native shell (iOS + Android). The web app is bundled into `www/` (built from the
// SPA via scripts/build-mobile.mjs) and talks to the hosted API at clout.kytepush.com.
const config: CapacitorConfig = {
  appId: 'com.kytepush.clout',
  appName: 'CLOUT',
  webDir: 'www',
  backgroundColor: '#08090f',
  ios: { contentInset: 'always' },
  plugins: {
    SplashScreen: { launchShowDuration: 900, backgroundColor: '#08090f', showSpinner: false, androidScaleType: 'CENTER_CROP' },
    StatusBar: { style: 'DARK', backgroundColor: '#08090f' },
  },
};

export default config;
