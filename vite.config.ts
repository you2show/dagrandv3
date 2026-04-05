import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), tailwindcss()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, './src'),
        }
      },
      // 👇 នេះគឺជាកូដដែលទើបតែបន្ថែមថ្មី ដើម្បីដោះស្រាយបញ្ហា Warning ទំហំ File JS 👇
      build: {
        chunkSizeWarningLimit: 1000, // បង្កើន limit កុំឲ្យលោត Warning
        rollupOptions: {
          output: {
            manualChunks(id) {
              // បំបែក File ធំចេញជាចំណែកតូចៗ ដើម្បីឲ្យវេបសាយដើរលឿន
              if (id.includes('node_modules')) {
                return id.toString().split('node_modules/')[1].split('/')[0].toString();
              }
            }
          }
        }
      }
      // 👆 បញ្ចប់ការបន្ថែម 👆
    };
});
