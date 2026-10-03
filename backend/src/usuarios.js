import { pool } from './db.js';
import { HttpError } from './clientes.js';
import { hashSenha, validarSenhaNova, normalizarPermissoes } from './auth.js';

const mapUsuario = (r) => ({
  id: r.id,
  usuario: r.username,
  nome: r.nome,
  grupoId: r.grupo_id,
  grupo: r.grupo_nome,
  ativo: r.ativo,
  ultimoLogin: r.ultimo_login,
  bloqueado: Boolean(r.bloqueado_ate && new Date(r.bloqueado_ate) > new Date()),
});

const mapGrupo = (r) => ({
  id: r.id,
  nome: r.nome,
  descricao: r.descricao || '',
  admin: r.is_admin,
  permissoes: r.permissoes,
  usuarios: Number(r.usuarios ?? 0),
});

/* ------------------------------ usuários ------------------------------ */

export async function listarUsuarios() {
  const { rows } = await pool.query(
    `SELECT u.*, g.nome AS grupo_nome FROM usuarios u JOIN grupos g ON g.id = u.grupo_id ORDER BY lower(u.nome)`);
  return rows.map(mapUsuario);
}

const dadosUsuario = (b) => {
  const nome = String(b.nome || '').trim();
  if (!nome) throw new HttpError(400, 'Informe o nome do usuário.');
  return { nome, grupoId: Number(b.grupoId) };
};

async function grupoExiste(db, id) {
  const { rows } = await db.query('SELECT id, is_admin FROM grupos WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(400, 'Grupo inválido.');
  return rows[0];
}

// Garante que sempre reste ao menos um administrador ativo.
async function outrosAdminsAtivos(db, exceto) {
  const { rows } = await db.query(
    `SELECT count(*)::int AS n FROM usuarios u JOIN grupos g ON g.id = u.grupo_id
     WHERE g.is_admin AND u.ativo AND u.id <> $1`, [exceto]);
  return rows[0].n;
}

export async function criarUsuario(b) {
  const { nome, grupoId } = dadosUsuario(b);
  const username = String(b.usuario || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,32}$/.test(username)) {
    throw new HttpError(400, 'O usuário deve ter de 3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou sublinhado.');
  }
  validarSenhaNova(b.senha);
  await grupoExiste(pool, grupoId);
  try {
    await pool.query(
      'INSERT INTO usuarios (username, nome, senha_hash, grupo_id, ativo) VALUES ($1,$2,$3,$4,$5)',
      [username, nome, await hashSenha(b.senha), grupoId, b.ativo !== false]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe um usuário com este login.');
    throw e;
  }
  return (await listarUsuarios()).find((u) => u.usuario === username);
}

export async function atualizarUsuario(id, b, eu) {
  const { nome, grupoId } = dadosUsuario(b);
  const ativo = b.ativo !== false;
  const grupo = await grupoExiste(pool, grupoId);
  const { rows } = await pool.query(
    `SELECT u.ativo, g.is_admin FROM usuarios u JOIN grupos g ON g.id = u.grupo_id WHERE u.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Usuário não encontrado.');
  const eraAdminAtivo = rows[0].is_admin && rows[0].ativo;
  const seraAdminAtivo = grupo.is_admin && ativo;
  if (eraAdminAtivo && !seraAdminAtivo) {
    if (id === eu.id) throw new HttpError(400, 'Você não pode remover o seu próprio acesso de administrador.');
    if (!(await outrosAdminsAtivos(pool, id))) throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
  }
  await pool.query('UPDATE usuarios SET nome = $2, grupo_id = $3, ativo = $4 WHERE id = $1', [id, nome, grupoId, ativo]);
  if (b.senha) {
    validarSenhaNova(b.senha);
    await pool.query('UPDATE usuarios SET senha_hash = $2, falhas = 0, bloqueado_ate = NULL WHERE id = $1', [id, await hashSenha(b.senha)]);
  }
  // Desativar ou trocar a senha de outra pessoa derruba as sessões abertas dela.
  if ((!ativo || b.senha) && id !== eu.id) await pool.query('DELETE FROM sessoes WHERE usuario_id = $1', [id]);
  return (await listarUsuarios()).find((u) => u.id === id);
}

export async function desbloquearUsuario(id) {
  await pool.query('UPDATE usuarios SET falhas = 0, bloqueado_ate = NULL WHERE id = $1', [id]);
}

export async function excluirUsuario(id, eu) {
  if (id === eu.id) throw new HttpError(400, 'Você não pode excluir o seu próprio usuário.');
  const { rows } = await pool.query(
    `SELECT u.ativo, g.is_admin FROM usuarios u JOIN grupos g ON g.id = u.grupo_id WHERE u.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Usuário não encontrado.');
  if (rows[0].is_admin && rows[0].ativo && !(await outrosAdminsAtivos(pool, id))) {
    throw new HttpError(400, 'É preciso manter ao menos um administrador ativo.');
  }
  await pool.query('DELETE FROM usuarios WHERE id = $1', [id]);
}

/* ------------------------------- grupos -------------------------------- */

export async function listarGrupos() {
  const { rows } = await pool.query(
    `SELECT g.*, (SELECT count(*) FROM usuarios u WHERE u.grupo_id = g.id) AS usuarios
     FROM grupos g ORDER BY g.is_admin DESC, lower(g.nome)`);
  return rows.map(mapGrupo);
}

const dadosGrupo = (b) => {
  const nome = String(b.nome || '').trim();
  if (!nome) throw new HttpError(400, 'Informe o nome do grupo.');
  return { nome, descricao: String(b.descricao || '').trim(), permissoes: normalizarPermissoes(b.permissoes) };
};

export async function criarGrupo(b) {
  const g = dadosGrupo(b);
  try {
    const { rows } = await pool.query(
      'INSERT INTO grupos (nome, descricao, permissoes) VALUES ($1,$2,$3) RETURNING id', [g.nome, g.descricao, g.permissoes]);
    return (await listarGrupos()).find((x) => x.id === rows[0].id);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe um grupo com este nome.');
    throw e;
  }
}

export async function atualizarGrupo(id, b) {
  const g = dadosGrupo(b);
  const { rows } = await pool.query('SELECT is_admin FROM grupos WHERE id = $1', [id]);
  if (!rows[0]) throw new HttpError(404, 'Grupo não encontrado.');
  if (rows[0].is_admin) throw new HttpError(400, 'O grupo Administrador não pode ser alterado.');
  try {
    await pool.query('UPDATE grupos SET nome = $2, descricao = $3, permissoes = $4 WHERE id = $1', [id, g.nome, g.descricao, g.permissoes]);
  } catch (e) {
    if (e.code === '23505') throw new HttpError(409, 'Já existe um grupo com este nome.');
    throw e;
  }
  return (await listarGrupos()).find((x) => x.id === id);
}

export async function excluirGrupo(id) {
  const { rows } = await pool.query(
    `SELECT g.is_admin, (SELECT count(*) FROM usuarios u WHERE u.grupo_id = g.id)::int AS n FROM grupos g WHERE g.id = $1`, [id]);
  if (!rows[0]) throw new HttpError(404, 'Grupo não encontrado.');
  if (rows[0].is_admin) throw new HttpError(400, 'O grupo Administrador não pode ser excluído.');
  if (rows[0].n) throw new HttpError(409, `Existem ${rows[0].n} usuário(s) neste grupo. Mova-os para outro grupo antes de excluir.`);
  await pool.query('DELETE FROM grupos WHERE id = $1', [id]);
}
