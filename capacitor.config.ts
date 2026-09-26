import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.lucky45.app',
  appName: 'LUCKY 45',
  webDir: 'dist',
  backgroundColor: '#181818',
  android: {
    allowMixedContent: false,
  },
}

export default config
