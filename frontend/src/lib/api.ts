import type {
  Cliente, ClienteForm, ClienteResumo, CnpjResposta, Etapa, Exclusao, Grupo, Permissao, SessaoUsuario, UsuarioAdmin,
} from './types';

export const EVENTO_SESSAO_EXPIRADA = 'auth:expirada';

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}), ...(init?.headers || {}) },
  });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && !url.startsWith('/api/auth/login')) window.dispatchEvent(new Event(EVENTO_SESSAO_EXPIRADA));
  if (!res.ok) throw new Error(body.erro || `Erro ${res.status}`);
  return body as T;
}

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

export const api = {
  // sessão
  login: (usuario: string, senha: string) => req<SessaoUsuario>('/api/auth/login', json('POST', { usuario, senha })),
  logout: () => req<void>('/api/auth/logout', json('POST')),
  me: () => req<SessaoUsuario>('/api/auth/me'),
  alterarSenha: (atual: string, nova: string) => req<void>('/api/auth/senha', json('POST', { atual, nova })),

  // clientes
  consultarCnpj: (cnpj: string) => req<CnpjResposta>(`/api/cnpj/${cnpj}`),
  listar: () => req<ClienteResumo[]>('/api/clientes'),
  obter: (id: string) => req<Cliente>(`/api/clientes/${id}`),
  criar: (b: ClienteForm) => req<Cliente>('/api/clientes', json('POST', b)),
  atualizar: (id: string, b: ClienteForm) => req<Cliente>(`/api/clientes/${id}`, json('PUT', b)),
  salvarEtapas: (id: string, etapas: Etapa[]) => req<Cliente>(`/api/clientes/${id}/etapas`, json('PUT', { etapas })),
  formalizar: (id: string, b: { dataContrato: string; numeroContrato: string; erp?: string }) =>
    req<Cliente>(`/api/clientes/${id}/formalizar`, json('POST', b)),
  excluir: (id: string, b: { motivo: string }) => req<void>(`/api/clientes/${id}`, json('DELETE', b)),
  exclusoes: () => req<Exclusao[]>('/api/exclusoes'),
  pdfUrl: (id: string) => `/api/clientes/${id}/pdf`,

  // administração
  permissoes: () => req<Permissao[]>('/api/permissoes'),
  usuarios: () => req<UsuarioAdmin[]>('/api/usuarios'),
  criarUsuario: (b: unknown) => req<UsuarioAdmin>('/api/usuarios', json('POST', b)),
  atualizarUsuario: (id: string, b: unknown) => req<UsuarioAdmin>(`/api/usuarios/${id}`, json('PUT', b)),
  desbloquearUsuario: (id: string) => req<void>(`/api/usuarios/${id}/desbloquear`, json('POST')),
  excluirUsuario: (id: string) => req<void>(`/api/usuarios/${id}`, json('DELETE')),
  grupos: () => req<Grupo[]>('/api/grupos'),
  criarGrupo: (b: unknown) => req<Grupo>('/api/grupos', json('POST', b)),
  atualizarGrupo: (id: number, b: unknown) => req<Grupo>(`/api/grupos/${id}`, json('PUT', b)),
  excluirGrupo: (id: number) => req<void>(`/api/grupos/${id}`, json('DELETE')),
};
