import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';
import { HttpError } from './clientes.js';

const scrypt = promisify(crypto.scrypt);

export const PERMISSOES = [
  { chave: 'dashboard.ver', rotulo: 'Ver o dashboard', area: 'Geral' },
  { chave: 'clientes.ver', rotulo: 'Ver a lista e o cadastro dos clientes', area: 'Clientes' },
  { chave: 'clientes.criar', rotulo: 'Cadastrar novos clientes', area: 'Clientes' },
  { chave: 'clientes.editar', rotulo: 'Editar o cadastro dos clientes', area: 'Clientes' },
  { chave: 'clientes.formalizar', rotulo: 'Formalizar contrato e definir o ERP', area: 'Clientes' },
  { chave: 'etapas.editar', rotulo: 'Atualizar as etapas do onboarding', area: 'Clientes' },
  { chave: 'clientes.excluir', rotulo: 'Excluir clientes', area: 'Clientes' },
  { chave: 'pdf.gerar', rotulo: 'Gerar o PDF do cliente', area: 'Clientes' },
  { chave: 'exclusoes.ver', rotulo: 'Ver o registro de exclusões', area: 'Geral' },
  { chave: 'admin.usuarios', rotulo: 'Gerenciar usuários e grupos', area: 'Administração' },
];
export const CHAVES = PERMISSOES.map((p) => p.chave);
// Quem faz qualquer ação sobre clientes precisa, no mínimo, ver clientes.
const EXIGEM_VER = ['clientes.criar', 'clientes.editar', 'clientes.formalizar', 'etapas.editar', 'clientes.excluir', 'pdf.gerar'];

export function normalizarPermissoes(lista) {
  const set = new Set((Array.isArray(lista) ? lista : []).filter((p) => CHAVES.includes(p)));
  if (EXIGEM_VER.some((p) => set.has(p))) set.add('clientes.ver');
  return CHAVES.filter((c) => set.has(c));
}

/* ------------------------------ senhas ------------------------------ */

export async function hashSenha(senha) {
  const salt = crypto.randomBytes(16);
  const h = await scrypt(senha, salt, 64);
  return `scrypt$${salt.toString('hex')}$${h.toString('hex')}`;
}

export async function confereSenha(senha, guardado) {
  const [alg, saltHex, hashHex] = String(guardado).split('$');
  if (alg !== 'scrypt') return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const h = await scrypt(senha, Buffer.from(saltHex, 'hex'), esperado.length);
  return crypto.timingSafeEqual(h, esperado);
}

let hashFalso;
export function validarSenhaNova(s) {
  if (typeof s !== 'string' || s.length < 8) throw new HttpError(400, 'A senha deve ter no mínimo 8 caracteres.');
  if (s.length > 200) throw new HttpError(400, 'Senha longa demais.');
}

/* ------------------------------ sessões ------------------------------ */

export const COOKIE = 'onb_sid';
const SESSAO_HORAS = 12;
const sha = (t) => crypto.createHash('sha256').update(t).digest('hex');

export function tokenDoCookie(req) {
  const raw = req.headers.cookie || '';
  for (const parte of raw.split(';')) {
    const [k, ...v] = parte.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

export function cookieSessao(token, seguro, maxAge = SESSAO_HORAS * 3600) {
  return `${COOKIE}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${maxAge}${seguro ? '; Secure' : ''}`;
}

const montarUsuario = (r) => ({
  id: r.id,
  usuario: r.username,
  nome: r.nome,
  grupoId: r.grupo_id,
  grupo: r.grupo_nome,
  admin: r.is_admin,
  permissoes: r.is_admin ? [...CHAVES] : normalizarPermissoes(r.permissoes),
});

export async function sessaoDe(req) {
  const token = tokenDoCookie(req);
  if (!token) return null;
  const { rows } = await pool.query(
    `SELECT u.id, u.username, u.nome, u.ativo, u.grupo_id, g.nome AS grupo_nome, g.is_admin, g.permissoes, s.expira_em
     FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id JOIN grupos g ON g.id = u.grupo_id
     WHERE s.token_hash = $1 AND s.expira_em > now()`,
    [sha(token)],
  );
  const r = rows[0];
  if (!r || !r.ativo) return null;
  // Renovação deslizante: quem está usando não é deslogado no meio do trabalho.
  if (new Date(r.expira_em) - Date.now() < (SESSAO_HORAS * 3600 - 600) * 1000) {
    await pool.query(`UPDATE sessoes SET expira_em = now() + make_interval(hours => $2) WHERE token_hash = $1`, [sha(token), SESSAO_HORAS]);
  }
  return montarUsuario(r);
}

async function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await pool.query('DELETE FROM sessoes WHERE expira_em < now()');
  await pool.query(
    `INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, now() + make_interval(hours => $3))`,
    [sha(token), usuarioId, SESSAO_HORAS],
  );
  return token;
}

export const encerrarSessao = (token) => pool.query('DELETE FROM sessoes WHERE token_hash = $1', [sha(token)]);

/* ------------------------------- login -------------------------------- */

const MAX_FALHAS = 5;
const BLOQUEIO_MIN = 10;

export async function login(usuario, senha) {
  const msg = 'Usuário ou senha inválidos.';
  const { rows } = await pool.query(
    `SELECT u.*, g.nome AS grupo_nome, g.is_admin, g.permissoes
     FROM usuarios u JOIN grupos g ON g.id = u.grupo_id WHERE u.username = $1`,
    [String(usuario || '').trim().toLowerCase()],
  );
  const u = rows[0];
  if (!u) {
    // Gasta o mesmo tempo de uma verificação real para não revelar quais usuários existem.
    hashFalso ||= await hashSenha('x');
    await confereSenha(String(senha || ''), hashFalso);
    throw new HttpError(401, msg);
  }
  if (u.bloqueado_ate && new Date(u.bloqueado_ate) > new Date()) {
    throw new HttpError(429, `Muitas tentativas incorretas. Tente novamente em ${BLOQUEIO_MIN} minutos.`);
  }
  if (!(await confereSenha(String(senha || ''), u.senha_hash))) {
    await pool.query(
      `UPDATE usuarios SET falhas = falhas + 1,
         bloqueado_ate = CASE WHEN falhas + 1 >= $2 THEN now() + make_interval(mins => $3) ELSE bloqueado_ate END
       WHERE id = $1`,
      [u.id, MAX_FALHAS, BLOQUEIO_MIN],
    );
    throw new HttpError(401, msg);
  }
  if (!u.ativo) throw new HttpError(403, 'Usuário desativado. Procure o administrador.');
  await pool.query('UPDATE usuarios SET falhas = 0, bloqueado_ate = NULL, ultimo_login = now() WHERE id = $1', [u.id]);
  return { token: await criarSessao(u.id), usuario: montarUsuario(u) };
}

export async function alterarPropriaSenha(userId, tokenAtual, atual, nova) {
  validarSenhaNova(nova);
  const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [userId]);
  if (!rows[0] || !(await confereSenha(String(atual || ''), rows[0].senha_hash))) {
    throw new HttpError(400, 'Senha atual incorreta.');
  }
  await pool.query('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [userId, await hashSenha(nova)]);
  // Derruba as outras sessões desse usuário, mantendo a atual.
  await pool.query('DELETE FROM sessoes WHERE usuario_id = $1 AND token_hash <> $2', [userId, sha(tokenAtual)]);
}

/* ------------------------ administrador inicial ------------------------ */

export async function garantirAdmin(log) {
  const nome = (process.env.ADMIN_USER || 'admin').toLowerCase();
  const senha = process.env.ADMIN_PASSWORD;
  const { rows } = await pool.query('SELECT id FROM usuarios WHERE username = $1', [nome]);
  if (rows[0]) {
    if (senha && process.env.ADMIN_PASSWORD_FORCE === 'true') {
      validarSenhaNova(senha);
      await pool.query('UPDATE usuarios SET senha_hash = $2, falhas = 0, bloqueado_ate = NULL, ativo = true WHERE id = $1', [rows[0].id, await hashSenha(senha)]);
      await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [rows[0].id]);
      log.warn(`Senha do usuário "${nome}" redefinida por ADMIN_PASSWORD_FORCE. Remova essa variável.`);
    }
    return;
  }
  if (!senha) throw new Error('ADMIN_PASSWORD não definida: necessária para criar o administrador inicial.');
  validarSenhaNova(senha);
  await pool.query(
    `INSERT INTO usuarios (username, nome, senha_hash, grupo_id)
     VALUES ($1, 'Administrador', $2, (SELECT id FROM grupos WHERE is_admin LIMIT 1))
     ON CONFLICT (username) DO NOTHING`,
    [nome, await hashSenha(senha)],
  );
  log.info(`Administrador inicial "${nome}" criado.`);
}
