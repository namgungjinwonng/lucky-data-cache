// LUCKY 45 애플리케이션을 브라우저와 Android WebView에 마운트하는 진입점
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
