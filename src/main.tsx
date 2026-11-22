import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.tsx';
import './index.css';

try {
  // Clear obsolete analytics data from browsers that used the earlier storefront.
  localStorage.removeItem('comicculture-conversion-choice');
  localStorage.removeItem('comicculture-conversion-session');
} catch { /* Browser storage may be unavailable. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
