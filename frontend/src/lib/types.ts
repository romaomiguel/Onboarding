export const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real', 'Terceiro Setor', 'Imune/Isenta', 'Outro'] as const;
export const SERVICOS = ['Contábil', 'Fiscal', 'Folha / DP', 'Societário / Paralegal', 'Financeiro', 'BPO', 'Consultoria', 'Outro'] as const;
export const STATUS_ETAPA = ['Pendente', 'Em andamento', 'Concluído'] as const;
export type StatusEtapa = (typeof STATUS_ETAPA)[number];

export interface Socio {
  id?: string;
  nome: string;
  documento: string;
  tipo: string;
  qualificacao: string;
  dataEntrada: string | null;
  faixaEtaria: string;
  responsavel: boolean;
  origem: 'opencnpj' | 'manual';
}

export interface Etapa {
  ordem: number;
  nome: string;
  status: StatusEtapa;
  data: string | null;
  responsavel: string;
  observacao: string;
}

export interface Apresentacao {
  empresa?: boolean;
  servicos?: boolean;
  canais?: boolean;
  responsavel?: boolean;
  atendimento?: boolean;
  data?: string;
  responsavelApresentacao?: string;
  canaisComunicacao?: string;
  formaAtendimento?: string;
  observacoes?: string;
}

export interface Cnae {
  codigo: string;
  descricao: string;
}

/** Dados do cadastro (o que o formulário edita). */
export interface ClienteForm {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataSituacao: string | null;
  matrizFilial: string;
  dataAbertura: string | null;
  naturezaJuridica: string;
  porte: string;
  capitalSocial: number | null;
  cnaePrincipal: string;
  cnaePrincipalDesc: string;
  cnaesSecundarios: Cnae[];
  opcaoSimples: boolean | null;
  opcaoMei: boolean | null;
  email: string;
  telefones: string[];
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  regime: string;
  dataInicio: string;
  dataCadastro: string;
  respRelacionamento: string;
  respComercial: string;
  gestor: string;
  dataContrato: string;
  numeroContrato: string;
  servicos: string[];
  apresentacao: Apresentacao;
  socios: Socio[];
  opencnpjRaw?: unknown;
}

export interface Cliente extends ClienteForm {
  id: string;
  erp: string | null;
  dataConclusao: string | null;
  etapas: Etapa[];
  percentual: number;
  status: 'Em andamento' | 'Concluído';
}

export type ClienteResumo = Omit<Cliente, 'etapas' | 'socios' | 'cnaesSecundarios'>;

export interface Exclusao {
  id: number;
  erp: string | null;
  cnpj: string | null;
  empresa: string;
  status: string;
  conclusao: number;
  excluidoPor: string;
  motivo: string;
  dataHora: string;
}

export interface CnpjDados {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  situacaoCadastral: string;
  dataSituacao: string | null;
  matrizFilial: string;
  dataAbertura: string | null;
  naturezaJuridica: string;
  porte: string;
  capitalSocial: number | null;
  cnaePrincipal: string;
  cnaePrincipalDesc: string;
  cnaesSecundarios: Cnae[];
  opcaoSimples: boolean;
  opcaoMei: boolean;
  regimeSugerido: string;
  email: string;
  telefones: string[];
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  qualificacaoResponsavel: string;
  socios: Socio[];
}

export interface SessaoUsuario {
  id: string;
  usuario: string;
  nome: string;
  grupoId: number;
  grupo: string;
  admin: boolean;
  permissoes: string[];
}

export interface Permissao {
  chave: string;
  rotulo: string;
  area: string;
}

export interface UsuarioAdmin {
  id: string;
  usuario: string;
  nome: string;
  grupoId: number;
  grupo: string;
  ativo: boolean;
  ultimoLogin: string | null;
  bloqueado: boolean;
}

export interface Grupo {
  id: number;
  nome: string;
  descricao: string;
  admin: boolean;
  permissoes: string[];
  usuarios: number;
}

export interface CnpjResposta {
  dados: CnpjDados;
  raw: unknown;
}
