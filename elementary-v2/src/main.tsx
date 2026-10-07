import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppProvider } from './contexts/AppContext'
import { capturePrerendered } from './utils/prerendered'

// createRoot가 #root를 비우기 전에, 서버가 그려 보낸 지역 허브를 받아 둔다.
capturePrerendered()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProvider>
      <App />
    </AppProvider>
  </StrictMode>,
)