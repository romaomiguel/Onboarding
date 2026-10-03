import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import './index.css';
import { AuthProvider, useAuth } from '@/lib/auth';
import { AppShell } from '@/components/app-shell';
import Login from '@/pages/login';
import Dashboard from '@/pages/dashboard';
import Clientes from '@/pages/clientes';
import ClienteEditor from '@/pages/cliente-editor';
import Exclusoes from '@/pages/exclusoes';
import Admin from '@/pages/admin';

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

// Protege a rota pela permissão; sem ela, manda para a primeira tela que o usuário pode ver.
function Guard({ perm, children }: { perm: string; children: React.ReactNode }) {
  const { can } = useAuth();
  if (can(perm)) return <>{children}</>;
  return <Navigate to={inicio(can)} replace />;
}

const inicio = (can: (p: string) => boolean) =>
  can('dashboard.ver') ? '/' : can('clientes.ver') ? '/clientes' : can('exclusoes.ver') ? '/exclusoes' : can('admin.usuarios') ? '/admin' : '/sem-acesso';

function SemAcesso() {
  const { sair } = useAuth();
  return (
    <div className="mx-auto mt-24 max-w-md text-center">
      <h1 className="text-lg font-semibold">Seu grupo ainda não tem nenhuma permissão</h1>
      <p className="mt-2 text-sm text-muted-foreground">Peça ao administrador para liberar o seu acesso.</p>
      <button className="mt-4 text-sm text-secondary underline" onClick={() => sair()}>Sair</button>
    </div>
  );
}

function App() {
  const { user, carregando, can } = useAuth();
  if (carregando) return <div className="grid min-h-screen place-items-center text-muted-foreground">Carregando…</div>;
  if (!user) return <Login />;
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Guard perm="dashboard.ver"><Dashboard /></Guard>} />
          <Route path="clientes" element={<Guard perm="clientes.ver"><Clientes /></Guard>} />
          <Route path="clientes/novo" element={<Guard perm="clientes.criar"><ClienteEditor /></Guard>} />
          <Route path="clientes/:id" element={<Guard perm="clientes.ver"><ClienteEditor /></Guard>} />
          <Route path="exclusoes" element={<Guard perm="exclusoes.ver"><Exclusoes /></Guard>} />
          <Route path="admin" element={<Guard perm="admin.usuarios"><Admin /></Guard>} />
          <Route path="sem-acesso" element={<SemAcesso />} />
          <Route path="*" element={<Navigate to={inicio(can)} replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <App />
      </AuthProvider>
      <Toaster richColors position="top-right" />
    </QueryClientProvider>
  </React.StrictMode>,
);
