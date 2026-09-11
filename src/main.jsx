import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { backfillAllMissingIds } from './db/db.js'

backfillAllMissingIds().catch((error) => console.error('uuid backfill failed', error))

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
