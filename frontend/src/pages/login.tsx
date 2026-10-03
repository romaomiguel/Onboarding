import { useState } from 'react';
import { Eye, EyeOff, Loader2, Lock, LogIn, TriangleAlert, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form';

export default function Login() {
  const { entrar } = useAuth();
  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrar, setMostrar] = useState(false);
  const [caps, setCaps] = useState(false);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      await entrar(usuario, senha);
    } catch (err) {
      setErro((err as Error).message);
      setSenha('');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center bg-white px-4 py-10">
      <main className="w-full max-w-[26rem]">
        <div className="overflow-hidden rounded-2xl border bg-card shadow-xl shadow-black/5">
          <div className="flex h-1.5"><span className="flex-1 bg-primary" /><span className="flex-1 bg-secondary" /></div>

          <div className="px-7 pb-7 pt-6">
            <h1 className="text-xl font-bold tracking-tight">Bem-vindo(a)</h1>
            <p className="mt-1 text-sm text-muted-foreground">Controle de Onboarding de Clientes</p>

            <form onSubmit={submit} className="mt-6 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Usuário</span>
                <div className="relative mt-1.5">
                  <User className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input className="pl-10" autoFocus autoComplete="username" autoCapitalize="none" spellCheck={false}
                    value={usuario} onChange={(e) => setUsuario(e.target.value)} />
                </div>
              </label>

              <div>
                <label htmlFor="senha" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Senha</label>
                <div className="relative mt-1.5">
                  <Lock className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
                  <Input id="senha" className="px-10" type={mostrar ? 'text' : 'password'} autoComplete="current-password"
                    value={senha} onChange={(e) => setSenha(e.target.value)}
                    onKeyUp={(e) => setCaps(e.getModifierState('CapsLock'))} onBlur={() => setCaps(false)} />
                  <button type="button" tabIndex={-1} onClick={() => setMostrar((m) => !m)}
                    aria-label={mostrar ? 'Ocultar senha' : 'Mostrar senha'}
                    className="absolute right-2 top-2 grid size-6 place-items-center rounded text-muted-foreground hover:text-foreground">
                    {mostrar ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {caps && (
                  <span className="mt-1.5 flex items-center gap-1.5 text-xs text-amber-700">
                    <TriangleAlert className="size-3.5" /> Caps Lock está ativado
                  </span>
                )}
              </div>

              {erro && (
                <p role="alert" className="flex items-start gap-2 rounded-md bg-accent px-3 py-2.5 text-sm text-accent-foreground">
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" /> {erro}
                </p>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={!usuario.trim() || !senha || enviando}>
                {enviando ? <Loader2 className="animate-spin" /> : <LogIn />} Entrar
              </Button>
            </form>
          </div>

          <div className="border-t bg-muted/50 px-7 py-3 text-center text-xs text-muted-foreground">
            Acesso restrito a colaboradores. Em caso de dúvida, procure o administrador.
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Contabilidade Exemplo
        </p>
      </main>
    </div>
  );
}
