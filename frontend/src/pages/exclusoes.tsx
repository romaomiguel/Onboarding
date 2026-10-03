import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { maskCnpj } from '@/lib/utils';
import { PageTitle } from '@/components/app-shell';
import { Card } from '@/components/ui/card';

export default function Exclusoes() {
  const { data = [], isLoading } = useQuery({ queryKey: ['exclusoes'], queryFn: api.exclusoes });

  return (
    <>
      <PageTitle title="Registro de exclusões" subtitle="Histórico de cadastros removidos, com responsável e motivo" />
      <Card className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b bg-muted/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
              {['ERP', 'Empresa', 'Status', 'Conclusão', 'Excluído por', 'Motivo', 'Data/hora'].map((h) => (
                <th key={h} className="px-4 py-3 font-semibold">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Carregando…</td></tr>}
            {!isLoading && !data.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum registro de exclusão.</td></tr>}
            {data.map((l) => (
              <tr key={l.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-bold text-secondary">{l.erp || '—'}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{l.empresa}</div>
                  {l.cnpj && <div className="text-xs text-muted-foreground">{maskCnpj(l.cnpj)}</div>}
                </td>
                <td className="px-4 py-3">{l.status}</td>
                <td className="px-4 py-3">{l.conclusao}%</td>
                <td className="px-4 py-3">{l.excluidoPor}</td>
                <td className="px-4 py-3">{l.motivo}</td>
                <td className="whitespace-nowrap px-4 py-3">{new Date(l.dataHora).toLocaleString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
