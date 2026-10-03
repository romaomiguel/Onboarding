import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { LayoutDashboard, LogOut, Trash2, UserCog, UserPlus, Users, KeyRound } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/form';

const links = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.ver' },
  { to: '/clientes', label: 'Clientes', icon: Users, perm: 'clientes.ver' },
  { to: '/clientes/novo', label: 'Novo cliente', icon: UserPlus, perm: 'clientes.criar' },
  { to: '/exclusoes', label: 'Exclusões', icon: Trash2, perm: 'exclusoes.ver' },
  { to: '/admin', label: 'Usuários e grupos', icon: UserCog, perm: 'admin.usuarios' },
];

export function AppShell() {
  const { user, can, sair } = useAuth();
  const [senhaAberta, setSenhaAberta] = useState(false);

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="flex flex-col border-b bg-card lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center gap-3 px-5 py-4 lg:block lg:py-6">
          <p className="text-xs font-medium text-muted-foreground lg:mt-3">Controle de Onboarding de Clientes</p>
        </div>
        <nav className="flex flex-1 gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-0">
          {links.filter((l) => can(l.perm)).map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted',
                  isActive && 'bg-accent text-accent-foreground hover:bg-accent',
                )
              }
            >
              <Icon className="size-4" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center justify-between gap-2 border-t px-4 py-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold">{user?.nome}</div>
            <div className="truncate text-xs text-muted-foreground">{user?.grupo}</div>
          </div>
          <div className="flex shrink-0">
            <Button variant="ghost" size="icon" title="Alterar minha senha" onClick={() => setSenhaAberta(true)}><KeyRound /></Button>
            <Button variant="ghost" size="icon" title="Sair" onClick={() => sair()}><LogOut /></Button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-[1280px]">
          <Outlet />
        </div>
      </main>
      {senhaAberta && <SenhaDialog onClose={() => setSenhaAberta(false)} />}
    </div>
  );
}

function SenhaDialog({ onClose }: { onClose: () => void }) {
  const [f, setF] = useState({ atual: '', nova: '', confirmar: '' });
  const alterar = useMutation({
    mutationFn: () => api.alterarSenha(f.atual, f.nova),
    onSuccess: () => { toast.success('Senha alterada.'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const invalido = !f.atual || f.nova.length < 8 || f.nova !== f.confirmar;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title="Alterar minha senha" description="A nova senha deve ter no mínimo 8 caracteres.">
      <div className="space-y-3">
        <Field label="Senha atual"><Input type="password" autoComplete="current-password" value={f.atual} onChange={(e) => setF({ ...f, atual: e.target.value })} /></Field>
        <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={f.nova} onChange={(e) => setF({ ...f, nova: e.target.value })} /></Field>
        <Field label="Confirmar nova senha" hint={f.confirmar && f.nova !== f.confirmar ? 'As senhas não coincidem.' : undefined}>
          <Input type="password" autoComplete="new-password" value={f.confirmar} onChange={(e) => setF({ ...f, confirmar: e.target.value })} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={invalido || alterar.isPending} onClick={() => alterar.mutate()}>Alterar</Button>
        </div>
      </div>
    </Dialog>
  );
}

export function PageTitle({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}
