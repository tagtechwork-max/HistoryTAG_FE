import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform your SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  // Build tweaks to improve chunking for large deps (maps, charts) and reduce warnings.
  build: {
    rollupOptions: {
      output: {
        // Put large vendor libs into separate chunks so they can be cached and lazy-loaded.
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('@react-jvectormap') || id.includes('react-jvectormap')) return 'vendor-jvectormap';
            if (id.includes('apexcharts') || id.includes('react-apexcharts')) return 'vendor-charts';
            if (id.includes('fullcalendar')) return 'vendor-fullcalendar';
            return 'vendor';
          }
        },
      },
    },
    // Remove console.log, console.warn, console.error in production build
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove all console.* calls (console.log, console.warn, console.error, etc.)
        drop_debugger: true, // Remove debugger statements
        pure_funcs: ['console.log', 'console.info', 'console.debug', 'console.trace'], // Remove specific console methods
      },
    },
  },
});
