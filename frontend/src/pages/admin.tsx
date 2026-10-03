import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Lock, Pencil, Plus, ShieldCheck, Trash2, Unlock } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Grupo, Permissao, UsuarioAdmin } from '@/lib/types';
import { PageTitle } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Check, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const EXIGEM_VER = ['clientes.criar', 'clientes.editar', 'clientes.formalizar', 'etapas.editar', 'clientes.excluir', 'pdf.gerar'];

export default function Admin() {
  return (
    <>
      <PageTitle title="Usuários e grupos" subtitle="Quem acessa o sistema e o que cada grupo pode fazer" />
      <Tabs defaultValue="usuarios">
        <TabsList className="mb-5">
          <TabsTrigger value="usuarios">Usuários</TabsTrigger>
          <TabsTrigger value="grupos">Grupos e permissões</TabsTrigger>
        </TabsList>
        <TabsContent value="usuarios"><Usuarios /></TabsContent>
        <TabsContent value="grupos"><Grupos /></TabsContent>
      </Tabs>
    </>
  );
}

/* ------------------------------- Usuários ------------------------------- */

function Usuarios() {
  const qc = useQueryClient();
  const { user: eu } = useAuth();
  const { data: usuarios = [], isLoading } = useQuery({ queryKey: ['usuarios'], queryFn: api.usuarios });
  const { data: grupos = [] } = useQuery({ queryKey: ['grupos'], queryFn: api.grupos });
  const [editando, setEditando] = useState<UsuarioAdmin | 'novo' | null>(null);

  const excluir = useMutation({
    mutationFn: (id: string) => api.excluirUsuario(id),
    onSuccess: () => { toast.success('Usuário excluído.'); qc.invalidateQueries({ queryKey: ['usuarios'] }); qc.invalidateQueries({ queryKey: ['grupos'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const desbloquear = useMutation({
    mutationFn: (id: string) => api.desbloquearUsuario(id),
    onSuccess: () => { toast.success('Usuário desbloqueado.'); qc.invalidateQueries({ queryKey: ['usuarios'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditando('novo')}><Plus /> Novo usuário</Button>
      </div>
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['Nome', 'Usuário', 'Grupo', 'Último acesso', 'Situação', ''].map((h) => <th key={h} className="px-4 py-3 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>}
            {usuarios.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-semibold">{u.nome}{u.id === eu?.id && <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.usuario}</td>
                <td className="px-4 py-3"><Badge tone={u.grupo === 'Administrador' ? 'red' : 'blue'}>{u.grupo}</Badge></td>
                <td className="px-4 py-3 text-muted-foreground">{u.ultimoLogin ? new Date(u.ultimoLogin).toLocaleString('pt-BR') : 'Nunca'}</td>
                <td className="px-4 py-3">
                  {u.bloqueado ? <Badge tone="amber">Bloqueado</Badge> : u.ativo ? <Badge tone="green">Ativo</Badge> : <Badge>Desativado</Badge>}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-1">
                    {u.bloqueado && <Button variant="ghost" size="icon" title="Desbloquear" onClick={() => desbloquear.mutate(u.id)}><Unlock /></Button>}
                    <Button variant="ghost" size="icon" title="Editar / redefinir senha" onClick={() => setEditando(u)}><Pencil /></Button>
                    <Button variant="ghost" size="icon" title="Excluir" className="text-destructive hover:text-destructive" disabled={u.id === eu?.id}
                      onClick={() => confirm(`Excluir o usuário ${u.nome}? Essa ação não pode ser desfeita.`) && excluir.mutate(u.id)}><Trash2 /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      {editando && <UsuarioDialog usuario={editando === 'novo' ? null : editando} grupos={grupos} onClose={() => setEditando(null)} />}
    </>
  );
}

function UsuarioDialog({ usuario, grupos, onClose }: { usuario: UsuarioAdmin | null; grupos: Grupo[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    usuario: usuario?.usuario ?? '',
    nome: usuario?.nome ?? '',
    grupoId: usuario?.grupoId ?? (grupos.find((g) => g.nome === 'Usuário')?.id ?? grupos[0]?.id ?? 0),
    senha: '',
    ativo: usuario?.ativo ?? true,
  });
  const salvar = useMutation({
    mutationFn: () => (usuario ? api.atualizarUsuario(usuario.id, f) : api.criarUsuario(f)),
    onSuccess: () => {
      toast.success(usuario ? 'Usuário atualizado.' : 'Usuário criado.');
      qc.invalidateQueries({ queryKey: ['usuarios'] });
      qc.invalidateQueries({ queryKey: ['grupos'] });
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const invalido = !f.nome.trim() || !f.grupoId || (!usuario && (!f.usuario.trim() || f.senha.length < 8)) || (!!f.senha && f.senha.length < 8);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={usuario ? 'Editar usuário' : 'Novo usuário'}
      description={usuario ? 'Deixe a senha em branco para mantê-la.' : 'A senha deve ter no mínimo 8 caracteres.'}>
      <div className="space-y-3">
        <Field label="Nome" required><Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></Field>
        <Field label="Usuário (login)" required hint={usuario ? undefined : 'Letras minúsculas, números, ponto, hífen ou sublinhado.'}>
          <Input value={f.usuario} readOnly={!!usuario} autoCapitalize="none" onChange={(e) => setF({ ...f, usuario: e.target.value.toLowerCase() })} />
        </Field>
        <Field label="Grupo" required>
          <Select value={f.grupoId} onChange={(e) => setF({ ...f, grupoId: Number(e.target.value) })}>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nome}</option>)}
          </Select>
        </Field>
        <Field label={usuario ? 'Nova senha' : 'Senha'} required={!usuario}>
          <Input type="password" autoComplete="new-password" value={f.senha} onChange={(e) => setF({ ...f, senha: e.target.value })} />
        </Field>
        <Check checked={f.ativo} onChange={(v) => setF({ ...f, ativo: v })}>Usuário ativo (pode entrar no sistema)</Check>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={invalido || salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  );
}

/* -------------------------------- Grupos -------------------------------- */

function Grupos() {
  const qc = useQueryClient();
  const { data: grupos = [], isLoading } = useQuery({ queryKey: ['grupos'], queryFn: api.grupos });
  const { data: permissoes = [] } = useQuery({ queryKey: ['permissoes'], queryFn: api.permissoes });
  const [editando, setEditando] = useState<Grupo | 'novo' | null>(null);

  const excluir = useMutation({
    mutationFn: (id: number) => api.excluirGrupo(id),
    onSuccess: () => { toast.success('Grupo excluído.'); qc.invalidateQueries({ queryKey: ['grupos'] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditando('novo')}><Plus /> Novo grupo</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {isLoading && <p className="text-muted-foreground">Carregando…</p>}
        {grupos.map((g) => (
          <Card key={g.id} className="flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="flex items-center gap-2 font-semibold">{g.admin ? <ShieldCheck className="size-4 text-primary" /> : <KeyRound className="size-4 text-secondary" />}{g.nome}</h3>
                <p className="mt-1 text-xs text-muted-foreground">{g.descricao || 'Sem descrição'}</p>
              </div>
              <Badge tone="gray">{g.usuarios} usuário(s)</Badge>
            </div>
            <ul className="my-4 flex-1 space-y-1 text-xs text-muted-foreground">
              {g.admin ? <li>Todas as permissões (fixo)</li> : g.permissoes.length
                ? g.permissoes.map((p) => <li key={p}>• {permissoes.find((x) => x.chave === p)?.rotulo ?? p}</li>)
                : <li>Nenhuma permissão</li>}
            </ul>
            <div className="flex justify-end gap-2">
              {g.admin ? <span className="flex items-center gap-1 text-xs text-muted-foreground"><Lock className="size-3" /> Grupo protegido</span> : (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditando(g)}><Pencil /> Editar</Button>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive"
                    onClick={() => confirm(`Excluir o grupo ${g.nome}?`) && excluir.mutate(g.id)}><Trash2 /></Button>
                </>
              )}
            </div>
          </Card>
        ))}
      </div>
      {editando && <GrupoDialog grupo={editando === 'novo' ? null : editando} permissoes={permissoes} onClose={() => setEditando(null)} />}
    </>
  );
}

function GrupoDialog({ grupo, permissoes, onClose }: { grupo: Grupo | null; permissoes: Permissao[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(grupo?.nome ?? '');
  const [descricao, setDescricao] = useState(grupo?.descricao ?? '');
  const [marcadas, setMarcadas] = useState<string[]>(grupo?.permissoes ?? ['dashboard.ver', 'clientes.ver']);

  const alternar = (chave: string, v: boolean) =>
    setMarcadas((m) => {
      let n = v ? [...new Set([...m, chave])] : m.filter((x) => x !== chave);
      if (v && EXIGEM_VER.includes(chave)) n = [...new Set([...n, 'clientes.ver'])];
      if (!v && chave === 'clientes.ver') n = n.filter((x) => !EXIGEM_VER.includes(x));
      return n;
    });

  const salvar = useMutation({
    mutationFn: () => (grupo ? api.atualizarGrupo(grupo.id, { nome, descricao, permissoes: marcadas }) : api.criarGrupo({ nome, descricao, permissoes: marcadas })),
    onSuccess: () => { toast.success('Grupo salvo.'); qc.invalidateQueries({ queryKey: ['grupos'] }); qc.invalidateQueries({ queryKey: ['usuarios'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const areas = [...new Set(permissoes.map((p) => p.area))];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={grupo ? 'Editar grupo' : 'Novo grupo'}
      description="Marque o que os usuários deste grupo podem fazer. A mudança vale de imediato para os usuários do grupo." className="max-h-[90vh] max-w-lg overflow-y-auto">
      <div className="space-y-4">
        <Field label="Nome do grupo" required><Input value={nome} onChange={(e) => setNome(e.target.value)} /></Field>
        <Field label="Descrição"><Textarea className="min-h-[56px]" value={descricao} onChange={(e) => setDescricao(e.target.value)} /></Field>
        {areas.map((area) => (
          <div key={area}>
            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{area}</div>
            <div className="grid gap-2">
              {permissoes.filter((p) => p.area === area).map((p) => (
                <Check key={p.chave} checked={marcadas.includes(p.chave)} onChange={(v) => alternar(p.chave, v)}>{p.rotulo}</Check>
              ))}
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={!nome.trim() || salvar.isPending} onClick={() => salvar.mutate()}>Salvar</Button>
        </div>
      </div>
    </Dialog>
  );
}
