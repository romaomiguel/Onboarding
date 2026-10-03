import { createContext, useContext, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, EVENTO_SESSAO_EXPIRADA } from './api';
import type { SessaoUsuario } from './types';

interface Ctx {
  user: SessaoUsuario | null;
  carregando: boolean;
  can: (perm: string) => boolean;
  entrar: (usuario: string, senha: string) => Promise<void>;
  sair: () => Promise<void>;
}

const AuthCtx = createContext<Ctx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<SessaoUsuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setCarregando(false));
    const expirou = () => { qc.clear(); setUser(null); };
    window.addEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
    return () => window.removeEventListener(EVENTO_SESSAO_EXPIRADA, expirou);
  }, [qc]);

  const value: Ctx = {
    user,
    carregando,
    can: (p) => !!user?.permissoes.includes(p),
    entrar: async (usuario, senha) => {
      qc.clear();
      setUser(await api.login(usuario, senha));
    },
    sair: async () => {
      await api.logout().catch(() => {});
      qc.clear();
      setUser(null);
    },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error('useAuth fora do AuthProvider');
  return c;
}
