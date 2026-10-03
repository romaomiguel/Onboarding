import type { CnpjDados, Socio } from './types';

/* Ponte com a extensão "Onboarding - Consulta Receita" (pasta extensao-receita/). */

const ORIGEM_APP = 'onboarding-app';
const ORIGEM_EXT = 'onboarding-ext';

export const URL_RECEITA = 'https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/';

type Campos = Record<string, string[]>;
export interface DadosReceita {
  cnpj: string;
  comprovante: Campos | null;
  qsa: { empresa: Record<string, string>; socios: Record<string, string>[] } | null;
}

/** Pergunta à extensão se está instalada (ela responde pela própria página). */
export function extensaoInstalada(): Promise<boolean> {
  return new Promise((resolve) => {
    const fim = (v: boolean) => { window.removeEventListener('message', ouvir); clearTimeout(t); resolve(v); };
    const ouvir = (e: MessageEvent) => { if (e.source === window && e.data?.origem === ORIGEM_EXT && e.data.tipo === 'pong') fim(true); };
    const t = setTimeout(() => fim(false), 800);
    window.addEventListener('message', ouvir);
    window.postMessage({ origem: ORIGEM_APP, tipo: 'ping' }, '*');
  });
}

/** Deve ser chamada direto de um clique (senão o navegador bloqueia a janela). */
export function abrirReceita(cnpj: string) {
  window.postMessage({ origem: ORIGEM_APP, tipo: 'pedido', cnpj }, '*');
  window.open(`${URL_RECEITA}?cnpj=${cnpj}`, '_blank');
}

export function escutarReceita(cb: (d: DadosReceita) => void): () => void {
  const ouvir = (e: MessageEvent) => {
    if (e.source !== window || e.data?.origem !== ORIGEM_EXT || e.data.tipo !== 'dados') return;
    cb({ cnpj: e.data.cnpj, comprovante: e.data.comprovante, qsa: e.data.qsa });
  };
  window.addEventListener('message', ouvir);
  return () => window.removeEventListener('message', ouvir);
}

/* ------------------------------ mapeamento ------------------------------ */

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toUpperCase().trim();
const vazioReceita = (s: string) => !s || /^[*\s]+$/.test(s) || /^n[aã]o informad/i.test(s);
const digitos = (s: string) => s.replace(/\D/g, '');
const dataISO = (s: string) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s.trim());
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
};
const semCodigo = (s: string) => s.replace(/^[\d.\-/]+\s+-\s+/, '').trim();
const RESPONSAVEL = /administrador|diretor|presidente|gerente|procurador|respons[aá]vel/i;

const lista = (c: Campos, prefixo: string): string[] => {
  const chaves = Object.keys(c);
  const k = chaves.find((t) => norm(t) === norm(prefixo)) || chaves.find((t) => norm(t).startsWith(norm(prefixo)));
  return (k ? c[k] : []).filter((v) => !vazioReceita(v));
};

// A Receita pode entregar todos os CNAEs num único bloco de texto: separa pelo padrão do código (00.00-0-00).
const CNAE_RE = /(\d{2}\.\d{2}-\d-\d{2})\s*-\s*([\s\S]*?)(?=\s*\d{2}\.\d{2}-\d-\d{2}\s*-|$)/g;
function separarCnaes(valores: string[]) {
  const vistos = new Set<string>();
  return [...valores.join(' ').matchAll(CNAE_RE)]
    .map((m) => ({ codigo: digitos(m[1]), descricao: m[2].trim() }))
    .filter((c) => c.descricao && !vistos.has(c.codigo) && vistos.add(c.codigo));
}

/** Converte o que a extensão capturou no formato do sistema. Só devolve o que a Receita informou. */
export function mapearReceita(d: DadosReceita): Partial<CnpjDados> {
  const out: Partial<CnpjDados> = {};
  const c = d.comprovante;
  if (c) {
    const um = (p: string) => lista(c, p)[0] || '';
    const cnae = um('CODIGO E DESCRICAO DA ATIVIDADE ECONOMICA PRINCIPAL');
    const email = um('ENDERECO ELETRONICO');
    Object.assign(out, {
      cnpj: digitos(lista(c, 'NUMERO DE INSCRICAO')[0] || d.cnpj),
      matrizFilial: (lista(c, 'NUMERO DE INSCRICAO')[1] || '').toLowerCase().replace(/^./, (x) => x.toUpperCase()),
      razaoSocial: um('NOME EMPRESARIAL'),
      nomeFantasia: um('TITULO DO ESTABELECIMENTO'),
      dataAbertura: dataISO(um('DATA DE CONSTITUICAO')),
      porte: um('PORTE'),
      naturezaJuridica: semCodigo(um('CODIGO E DESCRICAO DA NATUREZA JURIDICA')),
      cnaePrincipal: digitos(cnae.split(' - ')[0] || ''),
      cnaePrincipalDesc: cnae.includes(' - ') ? cnae.slice(cnae.indexOf(' - ') + 3) : '',
      cnaesSecundarios: separarCnaes(lista(c, 'CODIGO E DESCRICAO DAS ATIVIDADES ECONOMICAS SECUNDARIAS')),
      logradouro: um('LOGRADOURO'),
      numero: um('NUMERO'),
      complemento: um('COMPLEMENTO'),
      cep: digitos(um('CEP')),
      bairro: um('BAIRRO'),
      municipio: um('MUNICIPIO'),
      uf: um('UF'),
      email: email.toLowerCase(),
      telefones: um('TELEFONE').split('/').map((t) => t.trim()).filter(Boolean),
      situacaoCadastral: um('SITUACAO CADASTRAL').toLowerCase().replace(/^./, (x) => x.toUpperCase()),
      dataSituacao: dataISO(um('DATA DA SITUACAO CADASTRAL')),
    });
  }

  const q = d.qsa;
  if (q) {
    const cap = q.empresa['CAPITAL SOCIAL:'];
    const m = cap && /R\$\s*([\d.]+,\d{2})/.exec(cap);
    if (m) out.capitalSocial = Number(m[1].replace(/\./g, '').replace(',', '.'));
    if (!out.razaoSocial && q.empresa['NOME EMPRESARIAL:']) out.razaoSocial = q.empresa['NOME EMPRESARIAL:'];
    out.socios = q.socios
      .filter((s) => s['Nome/Nome Empresarial:'])
      .map((s): Socio => {
        const qualificacao = (s['Qualificação:'] || '').replace(/^\d+\s*-\s*/, '');
        return {
          nome: s['Nome/Nome Empresarial:'], documento: '', tipo: '', qualificacao,
          dataEntrada: null, faixaEtaria: '', responsavel: RESPONSAVEL.test(qualificacao), origem: 'opencnpj',
        };
      });
  }
  return out;
}
