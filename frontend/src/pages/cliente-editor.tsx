import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeCheck, ExternalLink, FileText, Loader2, Plus, Save, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { abrirReceita, escutarReceita, extensaoInstalada, mapearReceita } from '@/lib/receita';
import type { DadosReceita } from '@/lib/receita';
import { brl, dataBR, hojeISO, maskCep, maskCnae, maskCnpj, maskDocumento, onlyDigits } from '@/lib/utils';
import { REGIMES, SERVICOS, STATUS_ETAPA } from '@/lib/types';
import type { Cliente, ClienteForm, CnpjDados, CnpjResposta, Cnae, Etapa, Socio } from '@/lib/types';
import { PageTitle } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Badge, toneStatus } from '@/components/ui/badge';
import { Dialog } from '@/components/ui/dialog';
import { Check, Field, Input, Select, Textarea } from '@/components/ui/form';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const vazio = (): ClienteForm => ({
  cnpj: '', razaoSocial: '', nomeFantasia: '', situacaoCadastral: '', dataSituacao: null, matrizFilial: '',
  dataAbertura: null, naturezaJuridica: '', porte: '', capitalSocial: null, cnaePrincipal: '', cnaePrincipalDesc: '',
  cnaesSecundarios: [], opcaoSimples: null, opcaoMei: null, email: '', telefones: [], cep: '', logradouro: '',
  numero: '', complemento: '', bairro: '', municipio: '', uf: '', regime: '', dataInicio: '', dataCadastro: hojeISO(),
  respRelacionamento: '', respComercial: '', gestor: '', dataContrato: '', numeroContrato: '', servicos: [],
  apresentacao: {}, socios: [],
});

function doCliente(c: Cliente): ClienteForm {
  const base = vazio() as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { ...base };
  Object.entries(c).forEach(([k, v]) => {
    if (!(k in base)) return;
    out[k] = v === null && typeof base[k] === 'string' ? '' : v;
  });
  return out as unknown as ClienteForm;
}

// Sem quadro societário e sem ser empresário individual/MEI: dado que o usuário não tem como inferir.
const semQuadro = (d: CnpjDados) => !d.socios.length && !d.opcaoMei && !/individual/i.test(d.naturezaJuridica);

// Sócio único sem data de entrada: assume a data de abertura da empresa.
const entradaSocioUnico = (socios: Socio[], abertura: string | null): Socio[] =>
  socios.length === 1 && !socios[0].dataEntrada && abertura ? [{ ...socios[0], dataEntrada: abertura }] : socios;

export default function ClienteEditor() {
  const { id } = useParams();
  const { can } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();

  const { data: cliente, isLoading, error } = useQuery({
    queryKey: ['cliente', id],
    queryFn: () => api.obter(id!),
    enabled: !!id,
  });

  const [form, setForm] = useState<ClienteForm>(vazio);
  const [formalizando, setFormalizando] = useState(false);
  const [contrato, setContrato] = useState({ dataContrato: hojeISO(), numeroContrato: '', erp: '' });
  const carregado = useRef<string | null>(null);

  useEffect(() => {
    if (!id) {
      carregado.current = null;
      setForm(vazio());
      return;
    }
    if (cliente && carregado.current !== cliente.id + cliente.dataConclusao + cliente.erp) {
      carregado.current = cliente.id + cliente.dataConclusao + cliente.erp;
      setForm(doCliente(cliente));
      setContrato({ dataContrato: cliente.dataContrato || hojeISO(), numeroContrato: cliente.numeroContrato || '', erp: cliente.erp || '' });
    }
  }, [id, cliente]);

  const set = <K extends keyof ClienteForm>(k: K, v: ClienteForm[K]) => setForm((f) => ({ ...f, [k]: v }));
  const txt = (k: keyof ClienteForm) => ({
    value: (form[k] as string | null) ?? '',
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => set(k, e.target.value as never),
  });
  const ap = form.apresentacao;
  const setAp = (patch: Partial<ClienteForm['apresentacao']>) => set('apresentacao', { ...ap, ...patch });

  /* ---------------------------- OpenCNPJ ---------------------------- */
  const aplicarCnpj = (r: CnpjResposta) => {
    const d = r.dados;
    setForm((f) => ({
      ...f,
      cnpj: d.cnpj, razaoSocial: d.razaoSocial, nomeFantasia: d.nomeFantasia, situacaoCadastral: d.situacaoCadastral,
      dataSituacao: d.dataSituacao, matrizFilial: d.matrizFilial, dataAbertura: d.dataAbertura,
      naturezaJuridica: d.naturezaJuridica, porte: d.porte, capitalSocial: d.capitalSocial,
      cnaePrincipal: d.cnaePrincipal, cnaePrincipalDesc: d.cnaePrincipalDesc, cnaesSecundarios: d.cnaesSecundarios,
      opcaoSimples: d.opcaoSimples, opcaoMei: d.opcaoMei, email: d.email, telefones: d.telefones,
      cep: d.cep, logradouro: d.logradouro, numero: d.numero, complemento: d.complemento, bairro: d.bairro,
      municipio: d.municipio, uf: d.uf,
      regime: f.regime || d.regimeSugerido,
      // Sócios vindos da Receita são substituídos; os incluídos manualmente permanecem.
      socios: entradaSocioUnico([...d.socios, ...f.socios.filter((s) => s.origem === 'manual')], d.dataAbertura),
      opencnpjRaw: r.raw,
    }));
  };

  const consulta = useMutation({
    mutationFn: () => api.consultarCnpj(onlyDigits(form.cnpj)),
    onSuccess: (r) => {
      aplicarCnpj(r);
      toast.success(`Dados carregados: ${r.dados.razaoSocial} — ${r.dados.socios.length} sócio(s)/administrador(es).`);
      setReceita(semQuadro(r.dados) ? { motivo: 'As consultas automáticas não trouxeram o quadro societário desta empresa.' } : null);
    },
    onError: (e: Error) => {
      toast.error(e.message);
      if (e.message !== 'CNPJ inválido.') setReceita({ motivo: 'Nenhuma das consultas automáticas conseguiu os dados desta empresa.' });
    },
  });

  /* ------------------- último recurso: site da Receita ------------------- */
  const [receita, setReceita] = useState<{ motivo: string } | null>(null);
  const [extensaoOk, setExtensaoOk] = useState<boolean | null>(null);
  const [aguardandoReceita, setAguardandoReceita] = useState(false);

  useEffect(() => {
    if (receita && extensaoOk === null) extensaoInstalada().then(setExtensaoOk);
  }, [receita, extensaoOk]);

  // Preenche só o que está vazio: o que o usuário já digitou ou veio das APIs não é sobrescrito.
  const aplicarReceita = (d: DadosReceita) => {
    const m = mapearReceita(d);
    setForm((f) => {
      const n: Record<string, unknown> = { ...f };
      (Object.entries(m) as [string, unknown][]).forEach(([k, v]) => {
        if (k === 'socios' || k === 'cnpj') return;
        const atual = n[k];
        const vazioAtual = atual === null || atual === undefined || atual === '' || (Array.isArray(atual) && !atual.length);
        const temValor = v !== null && v !== '' && !(Array.isArray(v) && !v.length);
        if (vazioAtual && temValor) n[k] = v;
      });
      const socios = entradaSocioUnico(
        m.socios?.length ? [...m.socios, ...f.socios.filter((x) => x.origem === 'manual')] : f.socios,
        (n.dataAbertura as string | null) || null,
      );
      return { ...n, socios, opencnpjRaw: f.opencnpjRaw ?? { fonte: 'Receita (extensão)', ...d } } as ClienteForm;
    });
    setAguardandoReceita(false);
    setReceita(null);
    toast.success(`Dados da Receita carregados — ${m.socios?.length ?? 0} sócio(s)/administrador(es).`);
  };
  const aplicarReceitaRef = useRef(aplicarReceita);
  aplicarReceitaRef.current = aplicarReceita;
  const cnpjAtual = useRef('');
  cnpjAtual.current = onlyDigits(form.cnpj);
  useEffect(
    () => escutarReceita((d) => { if (d.cnpj === cnpjAtual.current) aplicarReceitaRef.current(d); }),
    [],
  );

  // Ao completar 14 dígitos num cadastro novo, já consulta.
  useEffect(() => {
    if (!id && onlyDigits(form.cnpj).length === 14 && !form.razaoSocial && !consulta.isPending) consulta.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.cnpj]);

  // Se o CNPJ deixa de ter 14 dígitos, os dados vindos da Receita somem do formulário.
  const alterarCnpj = (novo: string) =>
    setForm((f) => {
      if (novo.length === 14 || !(f.razaoSocial || f.socios.length || f.cnaePrincipal)) return { ...f, cnpj: novo };
      const v = vazio();
      return {
        ...f,
        cnpj: novo,
        razaoSocial: '', nomeFantasia: '', situacaoCadastral: '', dataSituacao: null, matrizFilial: '',
        dataAbertura: null, naturezaJuridica: '', porte: '', capitalSocial: null, cnaePrincipal: '',
        cnaePrincipalDesc: '', cnaesSecundarios: [], opcaoSimples: null, opcaoMei: null, email: '',
        telefones: [], cep: '', logradouro: '', numero: '', complemento: '', bairro: '', municipio: '', uf: '',
        socios: f.socios.filter((s) => s.origem === 'manual'), opencnpjRaw: v.opencnpjRaw,
      };
    });

  const faltando = () => {
    const f: string[] = [];
    if (onlyDigits(form.cnpj).length !== 14) f.push('CNPJ');
    if (!form.razaoSocial.trim()) f.push('Razão social');
    if (!form.regime) f.push('Regime tributário');
    if (!form.servicos.length) f.push('Serviços contratados');
    return f;
  };
  const validarESalvar = () => {
    const f = faltando();
    if (f.length) return toast.error(`Preencha os campos obrigatórios: ${f.join(', ')}.`);
    salvar.mutate();
  };

  /* ----------------------------- salvar ----------------------------- */
  const salvar = useMutation({
    mutationFn: () => (id ? api.atualizar(id, form) : api.criar(form)),
    onSuccess: (c) => {
      toast.success('Cadastro salvo.');
      qc.invalidateQueries({ queryKey: ['clientes'] });
      qc.setQueryData(['cliente', c.id], c);
      if (!id) nav(`/clientes/${c.id}`, { replace: true });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const formalizar = useMutation({
    mutationFn: async () => {
      await api.atualizar(id!, { ...form, dataContrato: contrato.dataContrato, numeroContrato: contrato.numeroContrato });
      return api.formalizar(id!, contrato);
    },
    onSuccess: (c) => {
      toast.success(`Contrato formalizado. ERP ${c.erp} atribuído.`);
      setFormalizando(false);
      qc.setQueryData(['cliente', c.id], c);
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* ----------------------------- sócios ----------------------------- */
  const setSocio = (i: number, patch: Partial<Socio>) =>
    set('socios', form.socios.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSocio = () =>
    set('socios', [...form.socios, { nome: '', documento: '', tipo: '', qualificacao: '', dataEntrada: null, faixaEtaria: '', responsavel: false, origem: 'manual' }]);

  if (id && isLoading) return <p className="text-muted-foreground">Carregando…</p>;
  if (id && error) return <p className="text-destructive">{(error as Error).message}</p>;

  const cadastroSalvo = !!id && !!cliente;
  const podeEditar = id ? can('clientes.editar') : can('clientes.criar');

  return (
    <>
      <PageTitle
        title={form.razaoSocial || (id ? 'Cliente' : 'Novo cliente')}
        subtitle={id ? 'Cadastro e acompanhamento do onboarding' : 'Informe o CNPJ para carregar os dados da Receita automaticamente'}
        actions={
          <>
            {cadastroSalvo && can('pdf.gerar') && (
              <Button variant="outline" asChild>
                <a href={api.pdfUrl(id!)} target="_blank" rel="noreferrer"><FileText /> Gerar PDF</a>
              </Button>
            )}
            {cadastroSalvo && can('clientes.formalizar') && (
              <Button variant="secondary" onClick={() => setFormalizando(true)}>
                <BadgeCheck /> {cliente!.erp ? 'Atualizar contrato' : 'Formalizar contrato'}
              </Button>
            )}
            {podeEditar && (
              <Button onClick={validarESalvar} disabled={salvar.isPending}>
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar cadastro
              </Button>
            )}
          </>
        }
      />

      {cadastroSalvo && (
        <Card className="mb-5 flex flex-wrap items-center justify-between gap-4 border-secondary/30 bg-secondary p-5 text-secondary-foreground">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider opacity-80">ERP do cliente</div>
            <div className="text-xs opacity-80">Identificação operacional e referência para o contrato</div>
          </div>
          <div className="flex items-center gap-4">
            <Badge tone={toneStatus(cliente!.status)}>{cliente!.status} · {cliente!.percentual}%</Badge>
            <div className="text-3xl font-bold tracking-wider">{cliente!.erp || '—'}</div>
          </div>
        </Card>
      )}

      {!podeEditar && (
        <p className="mb-5 rounded-md border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
          Você tem acesso somente para visualização deste cadastro.
        </p>
      )}

      <Tabs defaultValue="cadastro">
        <TabsList className="mb-5">
          <TabsTrigger value="cadastro">Cadastro</TabsTrigger>
          <TabsTrigger value="etapas" disabled={!cadastroSalvo}>Etapas do onboarding</TabsTrigger>
        </TabsList>

        <TabsContent value="cadastro">
          <fieldset disabled={!podeEditar} className="m-0 min-w-0 space-y-5 border-0 p-0">
          {/* CNPJ + dados da Receita */}
          <Card>
            <CardHeader title="1. Empresa" description="Dados obtidos da Receita Federal via OpenCNPJ — todos os campos podem ser ajustados" />
            <CardBody className="space-y-5">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="CNPJ" required className="w-full sm:w-72">
                  <Input placeholder="00.000.000/0000-00" inputMode="numeric" value={maskCnpj(form.cnpj)}
                    onChange={(e) => alterarCnpj(onlyDigits(e.target.value))} />
                </Field>
                <Button variant="outline" disabled={onlyDigits(form.cnpj).length !== 14 || consulta.isPending}
                  onClick={() => consulta.mutate()}>
                  {consulta.isPending ? <Loader2 className="animate-spin" /> : <Search />}
                  {cadastroSalvo ? 'Atualizar pela Receita' : 'Buscar dados'}
                </Button>
                {form.situacaoCadastral && (
                  <Badge tone={form.situacaoCadastral === 'Ativa' ? 'green' : 'red'} className="mb-2.5">{form.situacaoCadastral}</Badge>
                )}
              </div>

              {receita && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="max-w-2xl space-y-1">
                    <p className="font-semibold">{receita.motivo}</p>
                    {extensaoOk === false ? (
                      <p>Para buscar direto no site da Receita, instale a extensão “Onboarding - Consulta Receita” (pasta <code>extensao-receita</code>) neste navegador e recarregue a página.</p>
                    ) : aguardandoReceita ? (
                      <p>Na janela da Receita, resolva o captcha e clique em <b>Consultar</b>. Os dados voltam para cá sozinhos.</p>
                    ) : (
                      <p>Você pode consultar o site da Receita: o CNPJ já vai preenchido, é só resolver o captcha e consultar. Ou preencha os dados manualmente.</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => { setReceita(null); setAguardandoReceita(false); }}>Dispensar</Button>
                    {extensaoOk && (
                      <Button size="sm" disabled={onlyDigits(form.cnpj).length !== 14}
                        onClick={() => { abrirReceita(onlyDigits(form.cnpj)); setAguardandoReceita(true); }}>
                        <ExternalLink /> {aguardandoReceita ? 'Abrir novamente' : 'Consultar na Receita'}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Razão social" required className="lg:col-span-2"><Input {...txt('razaoSocial')} /></Field>
                <Field label="Nome fantasia"><Input {...txt('nomeFantasia')} /></Field>
                <Field label="Matriz / filial"><Input {...txt('matrizFilial')} /></Field>
                <Field label="Data de abertura"><Input type="date" value={form.dataAbertura || ''} onChange={(e) => set('dataAbertura', e.target.value || null)} /></Field>
                <Field label="Porte"><Input {...txt('porte')} /></Field>
                <Field label="Natureza jurídica" className="lg:col-span-2"><Input {...txt('naturezaJuridica')} /></Field>
                <Field label="Capital social" hint={form.capitalSocial != null ? brl(form.capitalSocial) : undefined}>
                  <Input type="number" step="0.01" value={form.capitalSocial ?? ''} onChange={(e) => set('capitalSocial', e.target.value === '' ? null : Number(e.target.value))} />
                </Field>
                <Field label="CNAE principal" className="lg:col-span-3">
                  <div className="flex gap-2">
                    <Input className="w-32 tabular-nums" placeholder="00.00-0-00" inputMode="numeric" value={maskCnae(form.cnaePrincipal)}
                      onChange={(e) => set('cnaePrincipal', onlyDigits(e.target.value))} />
                    <Input {...txt('cnaePrincipalDesc')} />
                  </div>
                </Field>
                <Field label="E-mail"><Input type="email" {...txt('email')} /></Field>
                <div className="flex flex-col gap-1.5 sm:col-span-2 lg:col-span-3">
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Telefones</span>
                  <div className="flex flex-wrap items-center gap-2">
                    {form.telefones.map((t, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <Input className="w-40" value={t} placeholder="(00) 00000-0000" onChange={(e) => set('telefones', form.telefones.map((x, j) => (j === i ? e.target.value : x)))} />
                        <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" title="Remover telefone"
                          onClick={() => set('telefones', form.telefones.filter((_, j) => j !== i))}><Trash2 /></Button>
                      </div>
                    ))}
                    <Button variant="outline" size="sm" onClick={() => set('telefones', [...form.telefones, ''])}><Plus /> Adicionar telefone</Button>
                  </div>
                </div>
                <div className="flex items-end gap-3 pb-1 text-xs text-muted-foreground">
                  {form.opcaoSimples !== null && <Badge tone={form.opcaoSimples ? 'blue' : 'gray'}>Simples: {form.opcaoSimples ? 'Optante' : 'Não'}</Badge>}
                  {form.opcaoMei !== null && <Badge tone={form.opcaoMei ? 'blue' : 'gray'}>MEI: {form.opcaoMei ? 'Sim' : 'Não'}</Badge>}
                </div>
              </div>

              <CnaesSecundarios lista={form.cnaesSecundarios} />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="2. Endereço" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="CEP"><Input value={maskCep(form.cep)} onChange={(e) => set('cep', onlyDigits(e.target.value))} /></Field>
              <Field label="Logradouro" className="lg:col-span-2"><Input {...txt('logradouro')} /></Field>
              <Field label="Número"><Input {...txt('numero')} /></Field>
              <Field label="Complemento" className="lg:col-span-2"><Input {...txt('complemento')} /></Field>
              <Field label="Bairro"><Input {...txt('bairro')} /></Field>
              <Field label="Município / UF">
                <div className="flex gap-2">
                  <Input {...txt('municipio')} />
                  <Input className="w-16 uppercase" maxLength={2} {...txt('uf')} />
                </div>
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="3. Quadro societário e responsáveis"
              description="Sócios e administradores vindos da Receita (CPF mascarado pela própria Receita). Marque quem é responsável pela empresa."
              action={<Button variant="outline" size="sm" onClick={addSocio}><Plus /> Adicionar</Button>}
            />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-2.5">Nome</th><th className="px-2 py-2.5">Qualificação</th>
                    <th className="px-2 py-2.5">Documento</th><th className="px-2 py-2.5">Entrada</th>
                    <th className="px-2 py-2.5 text-center">Responsável</th><th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {!form.socios.length && (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Nenhum sócio. Busque o CNPJ ou adicione manualmente.</td></tr>
                  )}
                  {form.socios.map((s, i) => (
                    <tr key={i} className="border-b last:border-0">
                      <td className="px-4 py-1.5">
                        <div className="flex items-center gap-2">
                          <Input className="h-9" value={s.nome} onChange={(e) => setSocio(i, { nome: e.target.value })} />
                          {s.origem === 'opencnpj' && <Badge tone="blue">Receita</Badge>}
                        </div>
                      </td>
                      <td className="px-2 py-1.5"><Input className="h-9" value={s.qualificacao} onChange={(e) => setSocio(i, { qualificacao: e.target.value })} /></td>
                      <td className="px-2 py-1.5"><Input className="h-9 w-48 tabular-nums" placeholder="CPF ou CNPJ" inputMode="numeric" value={maskDocumento(s.documento)}
                        onChange={(e) => setSocio(i, { documento: maskDocumento(e.target.value) })} /></td>
                      <td className="px-2 py-1.5">
                        <Input type="date" className="h-9 w-36" value={s.dataEntrada || ''} onChange={(e) => setSocio(i, { dataEntrada: e.target.value || null })} />
                      </td>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={s.responsavel} onChange={(e) => setSocio(i, { responsavel: e.target.checked })} />
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive" title="Remover"
                          onClick={() => set('socios', form.socios.filter((_, j) => j !== i))}><Trash2 /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card>
            <CardHeader title="4. Contrato e equipe" />
            <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Regime tributário" required>
                <Select {...txt('regime')}>
                  <option value="">Selecione</option>
                  {REGIMES.map((r) => <option key={r}>{r}</option>)}
                </Select>
              </Field>
              <Field label="Início do onboarding"><Input type="date" {...txt('dataInicio')} /></Field>
              <Field label="Data de cadastro"><Input type="date" {...txt('dataCadastro')} /></Field>
              <Field label="ERP do cliente"><Input readOnly value={cliente?.erp || ''} placeholder="Informado na formalização do contrato" /></Field>
              <Field label="Responsável pelo relacionamento"><Input {...txt('respRelacionamento')} /></Field>
              <Field label="Responsável comercial"><Input {...txt('respComercial')} /></Field>
              <Field label="Gestor responsável"><Input {...txt('gestor')} /></Field>
              <Field label="Nº / referência do contrato" hint={cliente?.dataContrato ? `Formalizado em ${dataBR(cliente.dataContrato)}` : undefined}>
                <Input readOnly value={cliente?.numeroContrato || ''} placeholder="Definido na formalização" />
              </Field>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title={<>5. Serviços contratados <span className="text-base text-red-600" title="Obrigatório">*</span></>} />
            <CardBody className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              {SERVICOS.map((s) => (
                <Check key={s} checked={form.servicos.includes(s)}
                  onChange={(v) => set('servicos', v ? [...form.servicos, s] : form.servicos.filter((x) => x !== s))}>{s}</Check>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="6. Itens apresentados ao cliente" description="A etapa 3 do onboarding só pode ser concluída com todos os itens, data e responsável registrados." />
            <CardBody className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <Check checked={!!ap.empresa} onChange={(v) => setAp({ empresa: v })}>Apresentação da empresa</Check>
                <Check checked={!!ap.servicos} onChange={(v) => setAp({ servicos: v })}>Serviços contratados</Check>
                <Check checked={!!ap.canais} onChange={(v) => setAp({ canais: v })}>Canais oficiais de comunicação</Check>
                <Check checked={!!ap.responsavel} onChange={(v) => setAp({ responsavel: v })}>Responsável pelo relacionamento</Check>
                <Check checked={!!ap.atendimento} onChange={(v) => setAp({ atendimento: v })} className="sm:col-span-2">Forma de atendimento e direcionamento das demandas</Check>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Data da apresentação"><Input type="date" value={ap.data || ''} onChange={(e) => setAp({ data: e.target.value })} /></Field>
                <Field label="Responsável pela apresentação"><Input value={ap.responsavelApresentacao || ''} onChange={(e) => setAp({ responsavelApresentacao: e.target.value })} /></Field>
                <Field label="Canais oficiais de comunicação"><Textarea placeholder="Ex.: e-mail, telefone, WhatsApp corporativo, portal etc." value={ap.canaisComunicacao || ''} onChange={(e) => setAp({ canaisComunicacao: e.target.value })} /></Field>
                <Field label="Forma de atendimento e direcionamento das demandas"><Textarea value={ap.formaAtendimento || ''} onChange={(e) => setAp({ formaAtendimento: e.target.value })} /></Field>
                <Field label="Observações" className="sm:col-span-2"><Textarea value={ap.observacoes || ''} onChange={(e) => setAp({ observacoes: e.target.value })} /></Field>
              </div>
            </CardBody>
          </Card>
          </fieldset>
        </TabsContent>

        <TabsContent value="etapas">
          {cliente && <EtapasPanel key={cliente.id + cliente.percentual + (cliente.dataConclusao || '')} cliente={cliente} podeSalvar={can('etapas.editar')} />}
        </TabsContent>
      </Tabs>

      <Dialog
        open={formalizando}
        onOpenChange={setFormalizando}
        title="Formalizar contrato"
        description={cliente?.erp ? `Este cliente já possui o ERP ${cliente.erp}. Os dados do contrato serão atualizados.` : 'Informe o ERP do cliente (código no sistema contábil). A etapa 1 será concluída.'}
      >
        <div className="space-y-3">
          <Field label="ERP do cliente" required hint={cliente?.erp ? 'O ERP não pode ser alterado depois de definido.' : 'Código do cliente no sistema contábil. Não pode repetir o de outro cliente.'}>
            <Input value={contrato.erp} readOnly={!!cliente?.erp} onChange={(e) => setContrato({ ...contrato, erp: e.target.value })} />
          </Field>
          <Field label="Data da formalização" required><Input type="date" value={contrato.dataContrato} onChange={(e) => setContrato({ ...contrato, dataContrato: e.target.value })} /></Field>
          <Field label="Nº ou referência do contrato (opcional)" hint="Texto livre para localizar o documento assinado. Ex.: Contrato 045/2026 ou Termo de adesão de 02/09/2026.">
            <Input value={contrato.numeroContrato} onChange={(e) => setContrato({ ...contrato, numeroContrato: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setFormalizando(false)}>Cancelar</Button>
            <Button disabled={!contrato.dataContrato || !contrato.erp.trim() || formalizar.isPending} onClick={() => formalizar.mutate()}>
              {formalizar.isPending && <Loader2 className="animate-spin" />} Confirmar
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}

/* --------------------------- CNAEs secundários --------------------------- */

const CNAES_VISIVEIS = 6;

function CnaeCard({ c }: { c: Cnae }) {
  return (
    <div className="rounded-md border bg-card px-3 py-2 shadow-sm">
      <div className="text-sm font-bold tabular-nums text-secondary">{maskCnae(c.codigo)}</div>
      <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{c.descricao || '—'}</div>
    </div>
  );
}

function CnaesSecundarios({ lista }: { lista: Cnae[] }) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  const termo = busca.trim().toLowerCase();
  const filtrada = termo
    ? lista.filter((c) => maskCnae(c.codigo).includes(termo) || onlyDigits(c.codigo).includes(onlyDigits(termo) || '§') || c.descricao.toLowerCase().includes(termo))
    : lista;

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">CNAEs secundários ({lista.length})</div>
        {lista.length > CNAES_VISIVEIS && (
          <Button variant="outline" size="sm" onClick={() => setAberto(true)}>Ver todos ({lista.length})</Button>
        )}
      </div>
      {lista.length ? (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {lista.slice(0, CNAES_VISIVEIS).map((c) => <CnaeCard key={c.codigo} c={c} />)}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nenhum CNAE secundário informado pela Receita.</p>
      )}

      <Dialog open={aberto} onOpenChange={(o) => { setAberto(o); if (!o) setBusca(''); }}
        title={`CNAEs secundários (${lista.length})`} description="Atividades econômicas secundárias registradas na Receita." className="max-w-3xl">
        <Input placeholder="Buscar por código ou descrição" value={busca} onChange={(e) => setBusca(e.target.value)} className="mb-3" />
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto pr-1 sm:grid-cols-2">
          {filtrada.map((c) => <CnaeCard key={c.codigo} c={c} />)}
          {!filtrada.length && <p className="col-span-full py-6 text-center text-sm text-muted-foreground">Nenhum CNAE encontrado.</p>}
        </div>
      </Dialog>
    </div>
  );
}

/* ------------------------------ Etapas ------------------------------ */

function EtapasPanel({ cliente, podeSalvar }: { cliente: Cliente; podeSalvar: boolean }) {
  const qc = useQueryClient();
  const [etapas, setEtapas] = useState<Etapa[]>(cliente.etapas);
  const upd = (i: number, patch: Partial<Etapa>) => setEtapas((e) => e.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const salvar = useMutation({
    mutationFn: () => api.salvarEtapas(cliente.id, etapas),
    onSuccess: (c) => {
      toast.success('Etapas salvas.');
      qc.setQueryData(['cliente', c.id], c);
      qc.invalidateQueries({ queryKey: ['clientes'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader
        title="Acompanhamento das etapas"
        description={`${cliente.percentual}% concluído${cliente.dataConclusao ? ` · finalizado em ${dataBR(cliente.dataConclusao)}` : ''}`}
        action={podeSalvar ? <Button variant="success" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar etapas</Button> : undefined}
      />
      <CardBody className="space-y-3">
        <fieldset disabled={!podeSalvar} className="m-0 min-w-0 space-y-3 border-0 p-0">
        {etapas.map((e, i) => (
          <div key={e.ordem} className="rounded-lg border">
            <div className="flex items-center justify-between gap-3 bg-muted/50 px-4 py-2.5">
              <div className="text-sm font-semibold">{i + 1}. {e.nome}</div>
              <Badge tone={toneStatus(e.status)}>{e.status}</Badge>
            </div>
            <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_2fr]">
              <Field label="Status">
                <Select value={e.status} onChange={(ev) => upd(i, { status: ev.target.value as Etapa['status'] })}>
                  {STATUS_ETAPA.map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
              <Field label="Data"><Input type="date" value={e.data || ''} onChange={(ev) => upd(i, { data: ev.target.value || null })} /></Field>
              <Field label="Responsável"><Input value={e.responsavel} onChange={(ev) => upd(i, { responsavel: ev.target.value })} /></Field>
              <Field label="Observação / apontamento" className="sm:col-span-2 lg:col-span-3">
                <Textarea className="min-h-[60px]" value={e.observacao} onChange={(ev) => upd(i, { observacao: ev.target.value })} />
              </Field>
            </div>
          </div>
        ))}
        </fieldset>
      </CardBody>
    </Card>
  );
}
