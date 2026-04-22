import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const manualChunks = (id) => {
  if (!id.includes('node_modules')) return

  if (id.includes('react-router-dom') || id.includes('\\react\\') || id.includes('\\react-dom\\') || id.includes('/react/') || id.includes('/react-dom/')) {
    return 'vendor-react'
  }
  if (id.includes('/firebase/') || id.includes('\\firebase\\')) {
    return 'vendor-firebase'
  }
  if (id.includes('/xlsx/') || id.includes('\\xlsx\\')) {
    return 'vendor-xlsx'
  }
  if (id.includes('/exceljs/') || id.includes('\\exceljs\\') || id.includes('/file-saver/') || id.includes('\\file-saver\\')) {
    return 'vendor-excel'
  }
  if (id.includes('/jspdf/') || id.includes('\\jspdf\\')) {
    return 'vendor-jspdf'
  }
  if (id.includes('/html2canvas/') || id.includes('\\html2canvas\\')) {
    return 'vendor-html2canvas'
  }
  if (id.includes('/qrious/') || id.includes('\\qrious\\') || id.includes('/qrcode.react/') || id.includes('\\qrcode.react\\')) {
    return 'vendor-qr'
  }
  if (id.includes('/chart.js/') || id.includes('\\chart.js\\') || id.includes('/react-chartjs-2/') || id.includes('\\react-chartjs-2\\') || id.includes('/leaflet/') || id.includes('\\leaflet\\')) {
    return 'vendor-analytics'
  }
  if (id.includes('/html5-qrcode/') || id.includes('\\html5-qrcode\\')) {
    return 'vendor-scanner'
  }

  return 'vendor-misc'
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
})
