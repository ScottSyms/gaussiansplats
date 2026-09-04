import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  publicDir: 'public',
  build: {
    target: 'esnext',
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      external: ['three', 'three/addons/controls/OrbitControls.js', 'three/addons/controls/PointerLockControls.js', '@sparkjsdev/spark']
    }
  }
});
