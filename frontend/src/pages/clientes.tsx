import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Pencil, Search, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dataBR, maskCnpj } from '@/lib/utils';
import type { ClienteResumo } from '@/lib/types';
import { PageTitle } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge, toneStatus } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/form';

export default function Clientes() {
  const nav = useNavigate();
  const { can } = useAuth();
  const qc = useQueryClient();
  const { data = [], isLoading, error } = useQuery({ queryKey: ['clientes'], queryFn: api.listar });
  const [busca, setBusca] = useState('');
  const [alvo, setAlvo] = useState<ClienteResumo | null>(null);
  const [motivo, setMotivo] = useState('');

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return data;
    return data.filter((c) =>
      [c.razaoSocial, c.nomeFantasia, c.cnpj, c.erp, c.gestor].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [data, busca]);

  const excluir = useMutation({
    mutationFn: () => api.excluir(alvo!.id, { motivo }),
    onSuccess: () => {
      toast.success('Cliente excluído e registrado no log.');
      setAlvo(null);
      setMotivo('');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.invalidateQueries({ queryKey: ['exclusoes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <PageTitle
        title="Clientes"
        subtitle="Onboardings cadastrados"
        actions={
          can('clientes.criar') && (
            <Button asChild>
              <Link to="/clientes/novo"><UserPlus /> Novo cliente</Link>
            </Button>
          )
        }
      />

      <div className="relative mb-4 max-w-md">
        <Search className="absolute left-3 top-3 size-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar por empresa, CNPJ, ERP ou gestor" value={busca} onChange={(e) => setBusca(e.target.value)} />
      </div>

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[860px] text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['ERP', 'Empresa', 'Tributação', 'Serviços', 'Gestor', 'Início', 'Conclusão', 'Status', ''].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>}
            {error && <tr><td colSpan={9} className="p-8 text-center text-destructive">{(error as Error).message}</td></tr>}
            {!isLoading && !error && !filtrados.length && (
              <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Nenhum cliente encontrado.</td></tr>
            )}
            {filtrados.map((c) => (
              <tr key={c.id} className="cursor-pointer border-b last:border-0 hover:bg-muted/40" onClick={() => nav(`/clientes/${c.id}`)}>
                <td className="px-4 py-3 font-bold text-secondary">{c.erp || '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{c.razaoSocial}</div>
                  <div className="text-xs text-muted-foreground">{maskCnpj(c.cnpj)}</div>
                </td>
                <td className="px-4 py-3">{c.regime || '—'}</td>
                <td className="max-w-[220px] px-4 py-3 text-xs text-muted-foreground">{c.servicos.join(', ') || '—'}</td>
                <td className="px-4 py-3">{c.gestor || '—'}</td>
                <td className="px-4 py-3">{dataBR(c.dataInicio)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-secondary" style={{ width: `${c.percentual}%` }} />
                    </div>
                    <span className="text-xs tabular-nums">{c.percentual}%</span>
                  </div>
                </td>
                <td className="px-4 py-3"><Badge tone={toneStatus(c.status)}>{c.status}</Badge></td>
                <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon" title="Abrir" asChild><Link to={`/clientes/${c.id}`}><Pencil /></Link></Button>
                    {can('pdf.gerar') && (
                      <Button variant="ghost" size="icon" title="Gerar PDF" asChild>
                        <a href={api.pdfUrl(c.id)} target="_blank" rel="noreferrer"><FileText /></a>
                      </Button>
                    )}
                    {can('clientes.excluir') && (
                      <Button variant="ghost" size="icon" title="Excluir" className="text-destructive hover:text-destructive" onClick={() => setAlvo(c)}>
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Dialog
        open={!!alvo}
        onOpenChange={(o) => !o && setAlvo(null)}
        title="Excluir cadastro"
        description={alvo ? `${alvo.razaoSocial}${alvo.erp ? ` (ERP ${alvo.erp})` : ''}. A exclusão fica registrada no log, com o seu nome, e não pode ser desfeita.` : undefined}
      >
        <div className="space-y-3">
          <Field label="Motivo"><Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setAlvo(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={!motivo.trim() || excluir.isPending} onClick={() => excluir.mutate()}>
              Excluir
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
