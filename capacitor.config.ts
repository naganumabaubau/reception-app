import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.reception.app',
  appName: '受付システム',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    cleartext: true,
    // url: 'http://localhost:3000' // ローカル開発時のみ有効にする
  },
  ios: {
    contentInset: 'automatic'
  }
};

export default config;
