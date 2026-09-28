import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { UploadProvider } from './context/UploadContext.jsx';
import { initSecurityConsoleWarning } from './utils/securityConsole.js';
import './index.css';

// Initialize console security warning banner for inspect/devtools
initSecurityConsoleWarning();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <UploadProvider>
        <App />
      </UploadProvider>
    </AuthProvider>
  </React.StrictMode>
);

