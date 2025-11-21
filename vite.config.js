import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/Megakem/',
  plugins: [react()],
  resolve: {
    alias: {
      'react-native': 'react-native-web',
      'react-native-linear-gradient': 'react-native-web-linear-gradient',
    },
    extensions: ['.web.js', '.js', '.web.jsx', '.jsx', '.json'],
  },
  optimizeDeps: {
    include: ['react-native-web'],
  },
})
