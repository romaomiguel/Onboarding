const BASE = process.env.OPENCNPJ_URL || 'https://api.opencnpj.org';
const SINTEGRA_URL = process.env.SINTEGRA_URL || 'https://www.sintegrabrasil.com.br/api/v1/cnpj';
const SINTEGRA_KEY = process.env.SINTEGRA_API_KEY || '';
const NEXTAPI_URL = process.env.NEXTAPI_URL || 'https://api.nextapi.com.br/v1/cnpj';
const NEXTAPI_KEY = process.env.NEXTAPI_API_KEY || '';
const TTL_MS = 10 * 60 * 1000;
const cache = new Map();

export const onlyDigits = (s) => String(s ?? '').replace(/\D/g, '');

export function cnpjValido(cnpj) {
  const d = onlyDigits(cnpj);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const calc = (len) => {
    let soma = 0;
    let peso = len - 7;
    for (let i = 0; i < len; i++) {
      soma += Number(d[i]) * peso--;
      if (peso < 2) peso = 9;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(d[12]) && calc(13) === Number(d[13]);
}

// A API devolve algumas descrições com UTF-8 lido como Latin-1 ("mÃºltiplos"). Desfaz isso.
function fixMojibake(s) {
  if (typeof s !== 'string' || !/[ÃÂ]/.test(s)) return s;
  try {
    const fixed = Buffer.from(s, 'latin1').toString('utf8');
    return fixed.includes('�') ? s : fixed;
  } catch {
    return s;
  }
}

function deepFix(v) {
  if (typeof v === 'string') return fixMojibake(v);
  if (Array.isArray(v)) return v.map(deepFix);
  if (v && typeof v === 'object') {
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deepFix(x)]));
  }
  return v;
}

const RESPONSAVEL_RE = /administrador|diretor|presidente|gerente|procurador|responsável|responsavel|sócio-gerente|socio-gerente/i;

const num = (s) => {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const dataOuNull = (s) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

// Converte o payload da OpenCNPJ no formato usado pelo sistema.
export function normalizar(raw) {
  const r = deepFix(raw);
  const simples = r.opcao_simples === 'S';
  const mei = r.opcao_mei === 'S';
  const cnaePrincipal = (r.cnaes || []).find((c) => c.is_principal);

  const socios = (r.QSA || []).map((s, i) => ({
    nome: s.nome_socio,
    documento: s.cnpj_cpf_socio || '',
    tipo: s.identificador_socio || '',
    qualificacao: s.qualificacao_socio || '',
    dataEntrada: dataOuNull(s.data_entrada_sociedade),
    faixaEtaria: s.faixa_etaria || '',
    responsavel: RESPONSAVEL_RE.test(s.qualificacao_socio || ''),
    origem: 'opencnpj',
    ordem: i,
  }));

  return {
    cnpj: onlyDigits(r.cnpj),
    razaoSocial: r.razao_social || '',
    nomeFantasia: r.nome_fantasia || '',
    situacaoCadastral: r.situacao_cadastral || '',
    dataSituacao: dataOuNull(r.data_situacao_cadastral),
    matrizFilial: r.matriz_filial || '',
    dataAbertura: dataOuNull(r.data_inicio_atividade),
    naturezaJuridica: r.natureza_juridica || '',
    porte: r.porte_empresa || '',
    capitalSocial: num(r.capital_social),
    cnaePrincipal: r.cnae_principal || '',
    cnaePrincipalDesc: cnaePrincipal?.descricao || '',
    cnaesSecundarios: (r.cnaes || [])
      .filter((c) => !c.is_principal)
      .map((c) => ({ codigo: c.codigo, descricao: c.descricao || '' })),
    opcaoSimples: simples,
    opcaoMei: mei,
    // Só o Simples/MEI é inferível pela Receita; Presumido/Real o usuário escolhe.
    regimeSugerido: mei || simples ? 'Simples Nacional' : '',
    email: (r.email || '').toLowerCase(),
    telefones: (r.telefones || [])
      .filter((t) => !t.is_fax)
      .map((t) => `(${t.ddd}) ${t.numero}`),
    cep: r.cep || '',
    logradouro: [r.tipo_logradouro, r.logradouro].filter(Boolean).join(' '),
    numero: r.numero || '',
    complemento: r.complemento || '',
    bairro: r.bairro || '',
    municipio: r.municipio || '',
    uf: r.uf || '',
    qualificacaoResponsavel: r.qualificacao_responsavel?.descricao || '',
    socios,
  };
}

export class CnpjError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const dataBr = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '');
  return m ? `${m[3]}-${m[2]}-${m[1]}` : dataOuNull(s);
};
const soDigitos = (v) => String(v || '').replace(/\D/g, '');
const tel = (t) => String(t || '').trim();
const semCodigo = (v) => String(v || '').replace(/^\d+\s*-\s*/, '');

// Sintegra Brasil: API pública sem QSA (sócios = []), datas dd/mm/aaaa.
function normalizarSintegra(r) {
  r = deepFix(r);
  const end = r.endereco || {};
  const atv = r.atividade_principal || {};
  const simples = r.simples?.optante_simples === 'Sim';
  const mei = r.simples?.optante_mei === 'Sim';
  return {
    cnpj: soDigitos(r.cnpj),
    razaoSocial: r.razao_social || '',
    nomeFantasia: r.nome_fantasia || '',
    situacaoCadastral: r.situacao_cadastral || '',
    dataSituacao: dataBr(r.data_situacao_cadastral),
    matrizFilial: r.tipo || '',
    dataAbertura: dataBr(r.data_inicio_atividade),
    naturezaJuridica: r.natureza_juridica || '',
    porte: r.porte || '',
    capitalSocial: num(String(r.capital_social || '').replace(/[^\d.,]/g, '')),
    cnaePrincipal: soDigitos(atv.codigo),
    cnaePrincipalDesc: atv.descricao || '',
    cnaesSecundarios: (r.atividades_secundarias || [])
      .map((c) => ({ codigo: soDigitos(c.codigo), descricao: c.descricao || '' })),
    opcaoSimples: simples,
    opcaoMei: mei,
    regimeSugerido: mei || simples ? 'Simples Nacional' : '',
    email: String(r.contato?.email || '').toLowerCase(),
    telefones: [r.contato?.telefone1, r.contato?.telefone2].map(tel).filter(Boolean),
    cep: soDigitos(end.cep),
    logradouro: end.logradouro || '',
    numero: '',
    complemento: '',
    bairro: end.bairro || '',
    municipio: end.municipio || r.municipio || '',
    uf: end.uf || r.uf || '',
    qualificacaoResponsavel: '',
    socios: [],
  };
}

// NextAPI: camelCase, sócios em quadroDeSocios (sem CPF/CNPJ).
function normalizarNextApi(r) {
  r = deepFix(r);
  const atv = r.atividadePrincipal || {};
  const socios = (r.quadroDeSocios || []).filter((s) => s.nome).map((s, i) => {
    const qualificacao = s.qualificacao || '';
    return {
      nome: s.nome,
      documento: '',
      tipo: '',
      qualificacao,
      dataEntrada: null,
      faixaEtaria: '',
      responsavel: RESPONSAVEL_RE.test(qualificacao),
      origem: 'opencnpj',
      ordem: i,
    };
  });
  return {
    cnpj: soDigitos(r.cnpj),
    razaoSocial: r.razaoSocial || '',
    nomeFantasia: r.nomeFantasia || '',
    situacaoCadastral: r.situacaoCadastral || '',
    dataSituacao: dataOuNull(r.dataSituacaoCadastral),
    matrizFilial: r.tipo || '',
    dataAbertura: dataOuNull(r.dataAbertura),
    naturezaJuridica: semCodigo(r.naturezaJuridica),
    porte: r.porte || '',
    capitalSocial: typeof r.capitalSocial === 'number' ? r.capitalSocial : null,
    cnaePrincipal: soDigitos(atv.codigo),
    cnaePrincipalDesc: atv.descricao || '',
    cnaesSecundarios: (r.atividadeSecundaria || [])
      .map((c) => ({ codigo: soDigitos(c.codigo), descricao: c.descricao || '' })),
    opcaoSimples: false,
    opcaoMei: false,
    regimeSugerido: '',
    email: String(r.email || '').toLowerCase(),
    telefones: [tel(r.telefone)].filter(Boolean),
    cep: soDigitos(r.cep),
    logradouro: r.logradouro || '',
    numero: r.numero || '',
    complemento: r.complemento || '',
    bairro: r.bairro || '',
    municipio: r.municipio || '',
    uf: r.uf || '',
    qualificacaoResponsavel: '',
    socios,
  };
}

async function buscar(nome, url, headers) {
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json', ...headers }, signal: AbortSignal.timeout(15000) });
  } catch {
    throw new CnpjError(502, `Não foi possível consultar a ${nome}.`);
  }
  if (res.status === 404) throw new CnpjError(404, 'CNPJ não encontrado na base da Receita.');
  if (res.status === 429) throw new CnpjError(429, `Limite de consultas da ${nome} atingido. Aguarde um instante.`);
  if (!res.ok) throw new CnpjError(502, `${nome} respondeu ${res.status}.`);
  try {
    return await res.json();
  } catch {
    throw new CnpjError(502, `${nome} devolveu uma resposta inválida.`);
  }
}

// simplesOk: o provedor informou Simples/MEI (OpenCNPJ e Sintegra informam; a NextAPI não).
const PROVEDORES = [
  {
    nome: 'OpenCNPJ',
    ativo: () => true,
    consultar: async (cnpj) => {
      const raw = await buscar('OpenCNPJ', `${BASE}/${cnpj}`, {});
      return { raw, normalizado: normalizar(raw), simplesOk: true };
    },
  },
  {
    nome: 'NextAPI',
    ativo: () => !!NEXTAPI_KEY,
    consultar: async (cnpj) => {
      const raw = await buscar('NextAPI', `${NEXTAPI_URL}/${cnpj}`, { authorization: `Bearer ${NEXTAPI_KEY}` });
      // A NextAPI não informa Simples/MEI na consulta principal: a Sintegra complementa.
      return { raw, normalizado: normalizarNextApi(raw), simplesOk: false };
    },
  },
  {
    nome: 'Sintegra Brasil',
    ativo: () => !!SINTEGRA_KEY,
    consultar: async (cnpj) => {
      const raw = await buscar('Sintegra Brasil', `${SINTEGRA_URL}/${cnpj}`, { 'X-Api-Key': SINTEGRA_KEY });
      return { raw, normalizado: normalizarSintegra(raw), simplesOk: true };
    },
  },
];

// Empresário individual/MEI não tem quadro societário.
const semSocios = (n) => n.opcaoMei || /empres[aá]rio \(individual\)|individual/i.test(n.naturezaJuridica);
const completo = (r) => r.simplesOk && (r.normalizado.socios.length > 0 || semSocios(r.normalizado));

// Consulta em cascata: OpenCNPJ -> NextAPI -> Sintegra Brasil. Só passa ao próximo provedor se o
// anterior falhou ou veio incompleto (sem sócios ou sem Simples/MEI); o que faltar é complementado.
export async function consultarCnpj(input, log) {
  const cnpj = onlyDigits(input);
  if (!cnpjValido(cnpj)) throw new CnpjError(400, 'CNPJ inválido.');

  const hit = cache.get(cnpj);
  if (hit && hit.exp > Date.now()) return hit.data;

  let base = null;
  const complementos = [];
  const erros = [];
  for (const p of PROVEDORES.filter((x) => x.ativo())) {
    try {
      const r = await p.consultar(cnpj);
      if (!base) base = { ...r, fonte: p.nome };
      else {
        const n = base.normalizado;
        if (!n.socios.length && r.normalizado.socios.length) {
          n.socios = r.normalizado.socios;
          base.fonteSocios = p.nome;
        }
        if (!base.simplesOk && r.simplesOk) {
          Object.assign(n, {
            opcaoSimples: r.normalizado.opcaoSimples,
            opcaoMei: r.normalizado.opcaoMei,
            regimeSugerido: r.normalizado.regimeSugerido,
          });
          base.simplesOk = true;
          complementos.push(p.nome);
        }
      }
      if (completo(base)) break;
    } catch (e) {
      if (!(e instanceof CnpjError)) throw e;
      log?.warn({ provedor: p.nome, status: e.status }, e.message);
      erros.push(e);
    }
  }

  if (!base) {
    if (erros.every((e) => e.status === 404)) throw erros[0];
    throw erros.find((e) => e.status === 429) || erros[erros.length - 1];
  }
  const data = { normalizado: base.normalizado, raw: base.raw, fonte: base.fonte, fonteSocios: base.fonteSocios };
  cache.set(cnpj, { data, exp: Date.now() + TTL_MS });
  return data;
}
