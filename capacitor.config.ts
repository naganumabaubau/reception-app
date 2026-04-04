import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.naganuma.reception',
  appName: '受付システム',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    cleartext: true,
    url: 'https://reception-app-164b.onrender.com'
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
