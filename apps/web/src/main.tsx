import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './i18n';
import './index.css';

// Old app kept the JWT in localStorage; the new one never does (AUTH-02).
try {
  localStorage.removeItem('jwt');
} catch {
  // storage unavailable
}

const root = document.getElementById('root');
if (!root) throw new Error('Root element #root not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
