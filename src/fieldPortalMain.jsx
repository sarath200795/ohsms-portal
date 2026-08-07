import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import FieldPortalApp from './FieldPortalApp.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FieldPortalApp />
  </StrictMode>,
);
