import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth.js';
import { queryClient } from './queryClient.js';
import { Login } from './pages/Login.js';
import { Dashboard } from './pages/Dashboard.js';
import { VmDetail } from './pages/VmDetail.js';
import { CreateWizard } from './pages/CreateWizard.js';
import { CreateSimple } from './pages/CreateSimple.js';
import { Console } from './pages/Console.js';
import './styles.css';

function Protected({ children }: { children: JSX.Element }) {
  const { user, loading } = useAuth();
  if (loading) return <p style={{ padding: 24 }}>Carregando…</p>;
  return user ? children : <Navigate to="/login" replace />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Dashboard /></Protected>} />
            <Route path="/vms/new" element={<Protected><CreateSimple /></Protected>} />
            <Route path="/vms/new/avancado" element={<Protected><CreateWizard /></Protected>} />
            <Route path="/vms/:id" element={<Protected><VmDetail /></Protected>} />
            <Route path="/vms/:id/console" element={<Protected><Console /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  </StrictMode>,
);
