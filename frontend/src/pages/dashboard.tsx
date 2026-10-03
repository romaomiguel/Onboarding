import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CheckCircle2, Clock, Layers, Percent, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { REGIMES, SERVICOS } from '@/lib/types';
import type { ClienteResumo } from '@/lib/types';
import { PageTitle } from '@/components/app-shell';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/form';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MESES_LONGOS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const PALETA = ['#3F499F', '#ED2324', '#0F9D8A', '#E59F1B', '#7B5CD6', '#2E7D9A', '#8D99AE', '#C2410C'];

const contar = <T,>(itens: T[], chave: (i: T) => string[]) => {
  const m: Record<string, number> = {};
  itens.forEach((i) => chave(i).forEach((k) => (m[k] = (m[k] || 0) + 1)));
  return m;
};
const paraSerie = (m: Record<string, number>) => Object.entries(m).map(([nome, total]) => ({ nome, total }));

const mesDe = (d: string) => Number(d.slice(5, 7));
const anoDe = (d: string) => Number(d.slice(0, 4));

function KPI({ icon: Icon, label, value }: { icon: typeof Users; label: string; value: string | number }) {
  return (
    <Card className="flex min-w-0 items-center gap-3 p-4">
      <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground"><Icon className="size-5" /></div>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums">{value}</div>
      </div>
    </Card>
  );
}

function ChartCard({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <Card>
      <CardHeader title={title} />
      <CardBody className="h-[280px]">
        {empty ? <div className="grid h-full place-items-center text-sm text-muted-foreground">Sem dados para os filtros selecionados.</div> : (
          <ResponsiveContainer width="100%" height="100%">{children as React.ReactElement}</ResponsiveContainer>
        )}
      </CardBody>
    </Card>
  );
}

export default function Dashboard() {
  const { data = [], isLoading } = useQuery({ queryKey: ['clientes'], queryFn: api.listar });
  const [f, setF] = useState({ mes: '', ano: String(new Date().getFullYear()), regime: '', servico: '', status: '' });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  const lista = useMemo(() => data.filter((c: ClienteResumo) => {
    if (f.ano && c.dataInicio && anoDe(c.dataInicio) !== Number(f.ano)) return false;
    if (f.mes && c.dataInicio && mesDe(c.dataInicio) !== Number(f.mes)) return false;
    if (f.regime && c.regime !== f.regime) return false;
    if (f.servico && !c.servicos.includes(f.servico)) return false;
    if (f.status && c.status !== f.status) return false;
    return true;
  }), [data, f]);

  const stats = useMemo(() => {
    const andamento = lista.filter((c) => c.status === 'Em andamento').length;
    const media = lista.length ? Math.round(lista.reduce((s, c) => s + c.percentual, 0) / lista.length) : 0;

    const mensal = MESES.map((nome, i) => ({ nome, total: lista.filter((c) => c.dataInicio && mesDe(c.dataInicio) === i + 1).length }));
    const anual = paraSerie(contar(data.filter((c) => c.dataInicio), (c) => [String(anoDe(c.dataInicio))])).sort((a, b) => a.nome.localeCompare(b.nome));
    const tributacao = paraSerie(contar(lista, (c) => [c.regime || 'Não informado']));
    const servicos = paraSerie(contar(lista, (c) => c.servicos)).sort((a, b) => b.total - a.total);
    const status = [
      { nome: 'Em andamento', total: andamento },
      { nome: 'Concluído', total: lista.length - andamento },
    ].filter((s) => s.total);
    const porRegime = [...REGIMES].map((r) => {
      const linha: Record<string, string | number> = { nome: r };
      SERVICOS.forEach((s) => { linha[s] = lista.filter((c) => (c.regime || 'Outro') === r && c.servicos.includes(s)).length; });
      return linha;
    });

    return {
      andamento, media, mensal, anual, tributacao, servicos, status, porRegime,
      totalServicos: lista.reduce((s, c) => s + c.servicos.length, 0),
    };
  }, [lista, data]);

  const eixo = { fontSize: 12, fill: 'hsl(220 9% 42%)' };
  const tooltip = { contentStyle: { borderRadius: 8, border: '1px solid hsl(220 14% 88%)', fontSize: 12 } };

  return (
    <>
      <PageTitle title="Dashboard" subtitle="Visão geral dos onboardings" />

      <Card className="mb-5">
        <CardBody className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Mês">
            <Select value={f.mes} onChange={set('mes')}>
              <option value="">Todos</option>
              {MESES_LONGOS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Ano"><Input type="number" value={f.ano} onChange={set('ano')} placeholder="Todos" /></Field>
          <Field label="Tributação">
            <Select value={f.regime} onChange={set('regime')}>
              <option value="">Todas</option>
              {REGIMES.map((r) => <option key={r}>{r}</option>)}
            </Select>
          </Field>
          <Field label="Serviço">
            <Select value={f.servico} onChange={set('servico')}>
              <option value="">Todos</option>
              {SERVICOS.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={f.status} onChange={set('status')}>
              <option value="">Todos</option>
              <option>Em andamento</option>
              <option>Concluído</option>
            </Select>
          </Field>
        </CardBody>
      </Card>

      {isLoading ? <p className="text-muted-foreground">Carregando…</p> : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-5">
            <KPI icon={Users} label="Total de clientes" value={lista.length} />
            <KPI icon={Clock} label="Em onboarding" value={stats.andamento} />
            <KPI icon={CheckCircle2} label="Concluídos" value={lista.length - stats.andamento} />
            <KPI icon={Percent} label="Conclusão média" value={`${stats.media}%`} />
            <KPI icon={Layers} label="Serviços contratados" value={stats.totalServicos} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <ChartCard title="Onboardings por mês" empty={!lista.length}>
              <BarChart data={stats.mensal}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} cursor={{ fill: 'hsl(220 16% 94%)' }} />
                <Bar dataKey="total" name="Onboardings" fill="#3F499F" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Onboardings por ano" empty={!stats.anual.length}>
              <BarChart data={stats.anual}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" tick={eixo} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} cursor={{ fill: 'hsl(220 16% 94%)' }} />
                <Bar dataKey="total" name="Onboardings" fill="#ED2324" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Clientes por tributação" empty={!stats.tributacao.length}>
              <PieChart>
                <Pie data={stats.tributacao} dataKey="total" nameKey="nome" innerRadius={55} outerRadius={95} paddingAngle={2}>
                  {stats.tributacao.map((_, i) => <Cell key={i} fill={PALETA[i % PALETA.length]} />)}
                </Pie>
                <Tooltip {...tooltip} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ChartCard>

            <ChartCard title="Serviços contratados" empty={!stats.servicos.length}>
              <BarChart data={stats.servicos} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="nome" width={130} tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} cursor={{ fill: 'hsl(220 16% 94%)' }} />
                <Bar dataKey="total" name="Clientes" fill="#0F9D8A" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Serviços por tributação" empty={!lista.length}>
              <BarChart data={stats.porRegime}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="nome" tick={{ ...eixo, fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={eixo} axisLine={false} tickLine={false} />
                <Tooltip {...tooltip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {SERVICOS.map((s, i) => <Bar key={s} dataKey={s} stackId="a" fill={PALETA[i % PALETA.length]} />)}
              </BarChart>
            </ChartCard>

            <ChartCard title="Status dos onboardings" empty={!stats.status.length}>
              <PieChart>
                <Pie data={stats.status} dataKey="total" nameKey="nome" outerRadius={95} label={({ nome, total }) => `${nome}: ${total}`}>
                  {stats.status.map((s) => <Cell key={s.nome} fill={s.nome === 'Concluído' ? '#0F9D8A' : '#E59F1B'} />)}
                </Pie>
                <Tooltip {...tooltip} />
              </PieChart>
            </ChartCard>
          </div>
        </>
      )}
    </>
  );
}
