import { pool } from './db.js';
import { onlyDigits, cnpjValido } from './opencnpj.js';

export const ETAPAS_BASE = [
  'Contrato formalizado',
  'Handoff Comercial → Implantação',
  'Apresentação da empresa, serviços contratados, canais, responsável e forma de atendimento',
  'Solicitação de documentação',
  'Recebimento e conferência da documentação',
  'Análise técnica',
  'Identificação e tratamento de riscos',
  'Implantação dos serviços',
  'Validação da implantação',
  'Transferência para operação',
  'Início da prestação dos serviços',
];

export const STATUS_ETAPA = ['Pendente', 'Em andamento', 'Concluído'];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const vazioNull = (v) => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim());
const dataNull = (v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

/* ------------------------------ mapeamento ------------------------------ */

function mapCliente(r) {
  return {
    id: r.id,
    erp: r.erp,
    cnpj: r.cnpj,
    razaoSocial: r.razao_social,
    nomeFantasia: r.nome_fantasia,
    situacaoCadastral: r.situacao_cadastral,
    dataSituacao: r.data_situacao,
    matrizFilial: r.matriz_filial,
    dataAbertura: r.data_abertura,
    naturezaJuridica: r.natureza_juridica,
    porte: r.porte,
    capitalSocial: r.capital_social,
    cnaePrincipal: r.cnae_principal,
    cnaePrincipalDesc: r.cnae_principal_desc,
    opcaoSimples: r.opcao_simples,
    opcaoMei: r.opcao_mei,
    email: r.email,
    telefones: r.telefones || [],
    cep: r.cep,
    logradouro: r.logradouro,
    numero: r.numero,
    complemento: r.complemento,
    bairro: r.bairro,
    municipio: r.municipio,
    uf: r.uf,
    regime: r.regime,
    dataInicio: r.data_inicio,
    dataCadastro: r.data_cadastro,
    respRelacionamento: r.resp_relacionamento,
    respComercial: r.resp_comercial,
    gestor: r.gestor,
    dataContrato: r.data_contrato,
    numeroContrato: r.numero_contrato,
    servicos: r.servicos || [],
    apresentacao: r.apresentacao || {},
    dataConclusao: r.data_conclusao,
  };
}

const mapSocio = (s) => ({
  id: s.id,
  nome: s.nome,
  documento: s.documento,
  tipo: s.tipo,
  qualificacao: s.qualificacao,
  dataEntrada: s.data_entrada,
  faixaEtaria: s.faixa_etaria,
  responsavel: s.responsavel,
  origem: s.origem,
});

const mapEtapa = (e) => ({
  ordem: e.ordem,
  nome: e.nome,
  status: e.status,
  data: e.data,
  responsavel: e.responsavel || '',
  observacao: e.observacao || '',
});

export const statusDe = (etapas) =>
  etapas.length && etapas.every((e) => e.status === 'Concluído') ? 'Concluído' : 'Em andamento';

export const percentualDe = (etapas) =>
  etapas.length ? Math.round((etapas.filter((e) => e.status === 'Concluído').length / etapas.length) * 100) : 0;

export function apresentacaoCompleta(ap = {}) {
  return Boolean(
    ap.empresa && ap.servicos && ap.canais && ap.responsavel && ap.atendimento &&
      ap.data && String(ap.responsavelApresentacao || '').trim(),
  );
}

/* -------------------------------- consultas ------------------------------- */

export async function listar() {
  const { rows } = await pool.query(`
    SELECT c.*,
      COALESCE(json_agg(json_build_object('status', e.status) ORDER BY e.ordem)
               FILTER (WHERE e.cliente_id IS NOT NULL), '[]') AS etapas
    FROM clientes c
    LEFT JOIN etapas e ON e.cliente_id = c.id
    GROUP BY c.id
    ORDER BY c.criado_em DESC`);
  return rows.map((r) => ({
    ...mapCliente(r),
    percentual: percentualDe(r.etapas),
    status: statusDe(r.etapas),
  }));
}

export async function obter(id, db = pool) {
  const { rows } = await db.query('SELECT * FROM clientes WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Cliente não encontrado.');
  // Em série: `db` pode ser um client de transação, que não aceita consultas simultâneas.
  const socios = await db.query('SELECT * FROM socios WHERE cliente_id = $1 ORDER BY ordem, nome', [id]);
  const cnaes = await db.query('SELECT codigo, descricao FROM cnaes_secundarios WHERE cliente_id = $1 ORDER BY codigo', [id]);
  const etapas = await db.query('SELECT * FROM etapas WHERE cliente_id = $1 ORDER BY ordem', [id]);
  const et = etapas.rows.map(mapEtapa);
  return {
    ...mapCliente(rows[0]),
    socios: socios.rows.map(mapSocio),
    cnaesSecundarios: cnaes.rows,
    etapas: et,
    percentual: percentualDe(et),
    status: statusDe(et),
  };
}

export async function listarExclusoes() {
  const { rows } = await pool.query('SELECT * FROM exclusoes_log ORDER BY data_hora DESC LIMIT 500');
  return rows.map((r) => ({
    id: r.id,
    erp: r.erp,
    cnpj: r.cnpj,
    empresa: r.empresa,
    status: r.status,
    conclusao: r.conclusao,
    excluidoPor: r.excluido_por,
    motivo: r.motivo,
    dataHora: r.data_hora,
  }));
}

/* ------------------------------- escrita --------------------------------- */

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    client.release();
  }
}

function validar(b) {
  const cnpj = onlyDigits(b.cnpj);
  if (!cnpjValido(cnpj)) throw new HttpError(400, 'CNPJ inválido.');
  if (!vazioNull(b.razaoSocial)) throw new HttpError(400, 'Informe a razão social.');
  if (!vazioNull(b.regime)) throw new HttpError(400, 'Informe o regime tributário.');
  if (!Array.isArray(b.servicos) || !b.servicos.length) throw new HttpError(400, 'Selecione ao menos um serviço contratado.');
  return cnpj;
}

async function gravarFilhos(db, id, b) {
  if (Array.isArray(b.socios)) {
    await db.query('DELETE FROM socios WHERE cliente_id = $1', [id]);
    for (const [i, s] of b.socios.entries()) {
      if (!vazioNull(s.nome)) continue;
      await db.query(
        `INSERT INTO socios (cliente_id, nome, documento, tipo, qualificacao, data_entrada,
                             faixa_etaria, responsavel, origem, ordem)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [id, s.nome.trim(), vazioNull(s.documento), vazioNull(s.tipo), vazioNull(s.qualificacao),
          dataNull(s.dataEntrada), vazioNull(s.faixaEtaria), Boolean(s.responsavel),
          s.origem === 'opencnpj' ? 'opencnpj' : 'manual', i],
      );
    }
  }
  if (Array.isArray(b.cnaesSecundarios)) {
    await db.query('DELETE FROM cnaes_secundarios WHERE cliente_id = $1', [id]);
    for (const c of b.cnaesSecundarios) {
      if (!vazioNull(c.codigo)) continue;
      await db.query(
        'INSERT INTO cnaes_secundarios (cliente_id, codigo, descricao) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
        [id, c.codigo, vazioNull(c.descricao)],
      );
    }
  }
}

const COLS = [
  ['razao_social', (b) => b.razaoSocial.trim()],
  ['nome_fantasia', (b) => vazioNull(b.nomeFantasia)],
  ['situacao_cadastral', (b) => vazioNull(b.situacaoCadastral)],
  ['data_situacao', (b) => dataNull(b.dataSituacao)],
  ['matriz_filial', (b) => vazioNull(b.matrizFilial)],
  ['data_abertura', (b) => dataNull(b.dataAbertura)],
  ['natureza_juridica', (b) => vazioNull(b.naturezaJuridica)],
  ['porte', (b) => vazioNull(b.porte)],
  ['capital_social', (b) => (Number.isFinite(b.capitalSocial) ? b.capitalSocial : null)],
  ['cnae_principal', (b) => vazioNull(b.cnaePrincipal)],
  ['cnae_principal_desc', (b) => vazioNull(b.cnaePrincipalDesc)],
  ['opcao_simples', (b) => (typeof b.opcaoSimples === 'boolean' ? b.opcaoSimples : null)],
  ['opcao_mei', (b) => (typeof b.opcaoMei === 'boolean' ? b.opcaoMei : null)],
  ['email', (b) => vazioNull(b.email)],
  ['telefones', (b) => (Array.isArray(b.telefones) ? b.telefones.filter(Boolean) : [])],
  ['cep', (b) => vazioNull(b.cep)],
  ['logradouro', (b) => vazioNull(b.logradouro)],
  ['numero', (b) => vazioNull(b.numero)],
  ['complemento', (b) => vazioNull(b.complemento)],
  ['bairro', (b) => vazioNull(b.bairro)],
  ['municipio', (b) => vazioNull(b.municipio)],
  ['uf', (b) => (vazioNull(b.uf) || '').slice(0, 2) || null],
  ['regime', (b) => vazioNull(b.regime)],
  ['data_inicio', (b) => dataNull(b.dataInicio)],
  ['data_cadastro', (b) => dataNull(b.dataCadastro) || new Date().toISOString().slice(0, 10)],
  ['resp_relacionamento', (b) => vazioNull(b.respRelacionamento)],
  ['resp_comercial', (b) => vazioNull(b.respComercial)],
  ['gestor', (b) => vazioNull(b.gestor)],
  ['data_contrato', (b) => dataNull(b.dataContrato)],
  ['numero_contrato', (b) => vazioNull(b.numeroContrato)],
  ['servicos', (b) => (Array.isArray(b.servicos) ? b.servicos : [])],
  ['apresentacao', (b) => JSON.stringify(b.apresentacao || {})],
];

function tratarUnique(e) {
  if (e.code === '23505') throw new HttpError(409, 'Já existe um cliente cadastrado com este CNPJ.');
  throw e;
}

export async function criar(b) {
  const cnpj = validar(b);
  try {
    const id = await tx(async (db) => {
      const cols = ['cnpj', ...COLS.map(([c]) => c), 'opencnpj_raw'];
      const vals = [cnpj, ...COLS.map(([, f]) => f(b)), b.opencnpjRaw ? JSON.stringify(b.opencnpjRaw) : null];
      const ph = cols.map((_, i) => `$${i + 1}`).join(',');
      const { rows } = await db.query(
        `INSERT INTO clientes (${cols.join(',')}) VALUES (${ph}) RETURNING id`, vals);
      const novo = rows[0].id;
      for (const [i, nome] of ETAPAS_BASE.entries()) {
        await db.query('INSERT INTO etapas (cliente_id, ordem, nome) VALUES ($1,$2,$3)', [novo, i, nome]);
      }
      await gravarFilhos(db, novo, b);
      return novo;
    });
    return obter(id);
  } catch (e) {
    return tratarUnique(e);
  }
}

export async function atualizar(id, b) {
  const cnpj = validar(b);
  try {
    await tx(async (db) => {
      const sets = ['cnpj', ...COLS.map(([c]) => c)].map((c, i) => `${c} = $${i + 2}`);
      const vals = [cnpj, ...COLS.map(([, f]) => f(b))];
      if (b.opencnpjRaw) {
        sets.push(`opencnpj_raw = $${vals.length + 2}`);
        vals.push(JSON.stringify(b.opencnpjRaw));
      }
      const r = await db.query(
        `UPDATE clientes SET ${sets.join(', ')}, atualizado_em = now() WHERE id = $1`, [id, ...vals]);
      if (!r.rowCount) throw new HttpError(404, 'Cliente não encontrado.');
      await gravarFilhos(db, id, b);
    });
    return obter(id);
  } catch (e) {
    return tratarUnique(e);
  }
}

// O ERP é o código do cliente no sistema contábil, informado pelo usuário. É único (índice UNIQUE)
// e, depois de definido, não muda.
export async function formalizar(id, { dataContrato, numeroContrato, erp }) {
  if (!dataNull(dataContrato)) throw new HttpError(400, 'Informe a data da formalização do contrato.');
  try {
    await tx(async (db) => {
    const { rows } = await db.query('SELECT erp, resp_comercial FROM clientes WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'Cliente não encontrado.');
    if (!rows[0].erp) {
      const codigo = vazioNull(erp);
      if (!codigo) throw new HttpError(400, 'Informe o ERP do cliente.');
      await db.query('UPDATE clientes SET erp = $2 WHERE id = $1', [id, codigo]);
    }
    await db.query(
      'UPDATE clientes SET data_contrato = $2, numero_contrato = $3, atualizado_em = now() WHERE id = $1',
      [id, dataContrato, vazioNull(numeroContrato)]);
    const obs = vazioNull(numeroContrato)
      ? `Contrato formalizado: ${numeroContrato.trim()}`
      : 'Contrato de prestação de serviços formalizado.';
    await db.query(
      `UPDATE etapas SET status = 'Concluído', data = COALESCE(data, $2),
              responsavel = COALESCE(NULLIF(responsavel,''), $3), observacao = $4
       WHERE cliente_id = $1 AND ordem = 0`,
      [id, dataContrato, rows[0].resp_comercial || '', obs]);
    });
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Este ERP já está cadastrado em outro cliente.');
    throw e;
  }
  return obter(id);
}

export async function salvarEtapas(id, etapasIn) {
  if (!Array.isArray(etapasIn) || etapasIn.length !== ETAPAS_BASE.length) {
    throw new HttpError(400, 'Lista de etapas inválida.');
  }
  await tx(async (db) => {
    const { rows } = await db.query('SELECT erp, apresentacao FROM clientes WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'Cliente não encontrado.');
    const { erp, apresentacao } = rows[0];

    const etapas = etapasIn.map((e, i) => {
      if (!STATUS_ETAPA.includes(e.status)) throw new HttpError(400, `Status inválido na etapa ${i + 1}.`);
      return {
        ordem: i,
        status: e.status,
        data: dataNull(e.data),
        responsavel: vazioNull(e.responsavel),
        observacao: vazioNull(e.observacao),
      };
    });

    if (etapas[0].status === 'Concluído' && !erp) {
      throw new HttpError(422, "A etapa 'Contrato formalizado' está concluída, mas o ERP ainda não foi atribuído. Use 'Formalizar contrato e atribuir ERP'.");
    }
    const apOk = apresentacaoCompleta(apresentacao);
    if (etapas[2].status === 'Concluído' && !apOk) {
      throw new HttpError(422, 'A etapa de apresentação não pode ser concluída enquanto os itens da apresentação não estiverem todos registrados (cadastro do cliente).');
    }
    if (apOk) {
      etapas[2].status = 'Concluído';
      etapas[2].data ||= apresentacao.data;
      etapas[2].responsavel ||= apresentacao.responsavelApresentacao;
    }

    for (const e of etapas) {
      await db.query(
        `UPDATE etapas SET status=$3, data=$4, responsavel=$5, observacao=$6
         WHERE cliente_id=$1 AND ordem=$2`,
        [id, e.ordem, e.status, e.data, e.responsavel, e.observacao]);
    }

    const concluido = etapas.every((e) => e.status === 'Concluído');
    if (concluido && !erp) {
      throw new HttpError(422, 'Não é possível concluir o onboarding sem ERP. Formalize o contrato primeiro.');
    }
    await db.query(
      `UPDATE clientes SET data_conclusao = CASE WHEN $2 THEN COALESCE(data_conclusao, CURRENT_DATE) ELSE NULL END,
              atualizado_em = now() WHERE id = $1`,
      [id, concluido]);
  });
  return obter(id);
}

export async function excluir(id, { motivo, usuario }) {
  if (!vazioNull(motivo)) throw new HttpError(400, 'Informe o motivo da exclusão.');
  if (!vazioNull(usuario)) throw new HttpError(400, 'Informe quem está realizando a exclusão.');
  await tx(async (db) => {
    const c = await obter(id, db);
    await db.query(
      `INSERT INTO exclusoes_log (erp, cnpj, empresa, status, conclusao, excluido_por, motivo)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.erp, c.cnpj, c.razaoSocial, c.status, c.percentual, usuario.trim(), motivo.trim()]);
    await db.query('DELETE FROM clientes WHERE id = $1', [id]);
  });
}
