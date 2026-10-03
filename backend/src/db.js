import pg from 'pg';

const { Pool, types } = pg;

// DATE (1082) e NUMERIC (1700): devolve datas como 'YYYY-MM-DD' e números como Number.
types.setTypeParser(1082, (v) => v);
types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX || 10),
});

const SCHEMA = `
CREATE SEQUENCE IF NOT EXISTS erp_seq START 1001;

CREATE TABLE IF NOT EXISTS clientes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  erp                 TEXT UNIQUE,
  cnpj                TEXT NOT NULL UNIQUE,
  razao_social        TEXT NOT NULL,
  nome_fantasia       TEXT,
  situacao_cadastral  TEXT,
  data_situacao       DATE,
  matriz_filial       TEXT,
  data_abertura       DATE,
  natureza_juridica   TEXT,
  porte               TEXT,
  capital_social      NUMERIC(18,2),
  cnae_principal      TEXT,
  cnae_principal_desc TEXT,
  opcao_simples       BOOLEAN,
  opcao_mei           BOOLEAN,
  email               TEXT,
  telefones           TEXT[] NOT NULL DEFAULT '{}',
  cep                 TEXT,
  logradouro          TEXT,
  numero              TEXT,
  complemento         TEXT,
  bairro              TEXT,
  municipio           TEXT,
  uf                  CHAR(2),
  regime              TEXT,
  data_inicio         DATE,
  data_cadastro       DATE NOT NULL DEFAULT CURRENT_DATE,
  resp_relacionamento TEXT,
  resp_comercial      TEXT,
  gestor              TEXT,
  data_contrato       DATE,
  numero_contrato     TEXT,
  servicos            TEXT[] NOT NULL DEFAULT '{}',
  apresentacao        JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_conclusao      DATE,
  opencnpj_raw        JSONB,
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS socios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id      UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  nome            TEXT NOT NULL,
  documento       TEXT,
  tipo            TEXT,
  qualificacao    TEXT,
  data_entrada    DATE,
  faixa_etaria    TEXT,
  responsavel     BOOLEAN NOT NULL DEFAULT false,
  origem          TEXT NOT NULL DEFAULT 'manual',
  ordem           INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS socios_cliente_idx ON socios(cliente_id);

CREATE TABLE IF NOT EXISTS cnaes_secundarios (
  cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  codigo     TEXT NOT NULL,
  descricao  TEXT,
  PRIMARY KEY (cliente_id, codigo)
);

CREATE TABLE IF NOT EXISTS etapas (
  cliente_id  UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  ordem       INT  NOT NULL,
  nome        TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'Pendente',
  data        DATE,
  responsavel TEXT,
  observacao  TEXT,
  PRIMARY KEY (cliente_id, ordem)
);

CREATE TABLE IF NOT EXISTS grupos (
  id         SERIAL PRIMARY KEY,
  nome       TEXT NOT NULL UNIQUE,
  descricao  TEXT,
  permissoes TEXT[] NOT NULL DEFAULT '{}',
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT NOT NULL UNIQUE,
  nome          TEXT NOT NULL,
  senha_hash    TEXT NOT NULL,
  grupo_id      INT NOT NULL REFERENCES grupos(id),
  ativo         BOOLEAN NOT NULL DEFAULT true,
  falhas        INT NOT NULL DEFAULT 0,
  bloqueado_ate TIMESTAMPTZ,
  ultimo_login  TIMESTAMPTZ,
  criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash TEXT PRIMARY KEY,
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessoes_usuario_idx ON sessoes(usuario_id);

-- Perfis padrão (só são criados se ainda não existirem; depois disso o administrador edita à vontade).
INSERT INTO grupos (nome, descricao, permissoes, is_admin) VALUES
  ('Administrador', 'Acesso total, inclusive usuários e grupos', '{}', true),
  ('Usuário', 'Acesso operacional, sem excluir clientes',
    '{dashboard.ver,clientes.ver,clientes.criar,clientes.editar,clientes.formalizar,etapas.editar,pdf.gerar,exclusoes.ver}', false),
  ('Somente visualização', 'Consulta dashboard, clientes e PDF, sem alterar nada',
    '{dashboard.ver,clientes.ver,pdf.gerar}', false)
ON CONFLICT (nome) DO NOTHING;

CREATE TABLE IF NOT EXISTS exclusoes_log (
  id           BIGSERIAL PRIMARY KEY,
  erp          TEXT,
  cnpj         TEXT,
  empresa      TEXT NOT NULL,
  status       TEXT,
  conclusao    INT,
  excluido_por TEXT NOT NULL,
  motivo       TEXT NOT NULL,
  data_hora    TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

// Roda na inicialização. O advisory lock evita que as 2 réplicas criem as tabelas ao mesmo tempo.
export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(727001)');
    await client.query(SCHEMA);
  } finally {
    await client.query('SELECT pg_advisory_unlock(727001)').catch(() => {});
    client.release();
  }
}
