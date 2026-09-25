import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initializeCloud } from './cloud/runtime.js'

const root = createRoot(document.getElementById('root'));
root.render(<main><h1>AP Trainer</h1><p role="status">Opening your saved history…</p></main>);
initializeCloud().then(() => root.render(
  <StrictMode>
    <App />
  </StrictMode>,
)).catch(error => root.render(<main><h1>AP Trainer</h1><p role="alert">{error.message}</p><button onClick={() => location.reload()}>Retry loading</button></main>))
