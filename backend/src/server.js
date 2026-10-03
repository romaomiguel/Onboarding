import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { pool, migrate } from './db.js';
import { consultarCnpj, CnpjError } from './opencnpj.js';
import * as clientes from './clientes.js';
import * as usuarios from './usuarios.js';
import * as auth from './auth.js';
import { gerarPdf } from './pdf.js';

const app = Fastify({ logger: true, bodyLimit: 2 * 1024 * 1024, trustProxy: true });

// Aceita corpo JSON vazio (ex.: DELETE e POST sem dados) em vez de responder 400.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
  if (!body) return done(null, {});
  try {
    done(null, JSON.parse(body));
  } catch {
    const e = new Error('JSON inválido');
    e.statusCode = 400;
    done(e);
  }
});

app.setErrorHandler((err, req, reply) => {
  if (err instanceof clientes.HttpError || err instanceof CnpjError) {
    return reply.code(err.status).send({ erro: err.message });
  }
  if (err.code === '22P02') return reply.code(404).send({ erro: 'Registro não encontrado.' });
  if (err.validation || err.statusCode === 400) return reply.code(400).send({ erro: 'Requisição inválida.' });
  req.log.error(err);
  return reply.code(500).send({ erro: 'Erro interno do servidor.' });
});

app.addHook('onSend', async (_req, reply) => {
  reply.header('X-Content-Type-Options', 'nosniff');
  reply.header('X-Frame-Options', 'DENY');
  reply.header('Referrer-Policy', 'same-origin');
});

/* ---------------- autenticação e autorização (todas as rotas /api) ---------------- */
// Cada rota declara config.perm: 'logado' (qualquer usuário autenticado), uma chave de permissão,
// ou uma lista (basta uma). Rota sem declaração é negada: falha fechada.
const PUBLICAS = new Set(['/api/auth/login']);

app.addHook('onRequest', async (req, reply) => {
  const rota = req.url.split('?')[0];
  if (!rota.startsWith('/api/') || PUBLICAS.has(rota)) return;

  const user = await auth.sessaoDe(req);
  if (!user) return reply.code(401).send({ erro: 'Sessão expirada. Faça login novamente.' });
  req.user = user;

  const perm = req.routeOptions?.config?.perm;
  if (!perm) return reply.code(403).send({ erro: 'Acesso negado.' });
  if (perm === 'logado') return;
  const aceitas = Array.isArray(perm) ? perm : [perm];
  if (!aceitas.some((p) => user.permissoes.includes(p))) {
    return reply.code(403).send({ erro: 'Você não tem permissão para esta ação.' });
  }
});

const rota = (perm) => ({ config: { perm } });
const somenteAdmin = rota('admin.usuarios');

// Liveness: o processo responde. Readiness: o banco responde (tira a réplica do Service se cair).
app.get('/healthz', async () => ({ ok: true }));
app.get('/readyz', async (_req, reply) => {
  try {
    await pool.query('SELECT 1');
    return { ok: true };
  } catch {
    return reply.code(503).send({ ok: false });
  }
});

/* --------------------------------- sessão --------------------------------- */
app.post('/api/auth/login', async (req, reply) => {
  const { usuario, senha } = req.body || {};
  const r = await auth.login(usuario, senha);
  reply.header('Set-Cookie', auth.cookieSessao(r.token, req.protocol === 'https'));
  return r.usuario;
});
app.post('/api/auth/logout', rota('logado'), async (req, reply) => {
  const t = auth.tokenDoCookie(req);
  if (t) await auth.encerrarSessao(t);
  reply.header('Set-Cookie', auth.cookieSessao('', req.protocol === 'https', 0));
  return reply.code(204).send();
});
app.get('/api/auth/me', rota('logado'), async (req) => req.user);
app.post('/api/auth/senha', rota('logado'), async (req, reply) => {
  const { atual, nova } = req.body || {};
  await auth.alterarPropriaSenha(req.user.id, auth.tokenDoCookie(req), atual, nova);
  return reply.code(204).send();
});

/* ---------------------------------- CNPJ ---------------------------------- */
app.get('/api/cnpj/:cnpj', rota(['clientes.criar', 'clientes.editar']), async (req) => {
  const { normalizado, raw, fonte, fonteSocios } = await consultarCnpj(req.params.cnpj, req.log);
  return { dados: normalizado, raw, fonte, fonteSocios };
});

/* --------------------------------- clientes --------------------------------- */
app.get('/api/clientes', rota(['clientes.ver', 'dashboard.ver']), () => clientes.listar());
app.get('/api/clientes/:id', rota('clientes.ver'), (req) => clientes.obter(req.params.id));
app.post('/api/clientes', rota('clientes.criar'), async (req, reply) => reply.code(201).send(await clientes.criar(req.body || {})));
app.put('/api/clientes/:id', rota('clientes.editar'), (req) => clientes.atualizar(req.params.id, req.body || {}));
app.put('/api/clientes/:id/etapas', rota('etapas.editar'), (req) => clientes.salvarEtapas(req.params.id, req.body?.etapas));
app.post('/api/clientes/:id/formalizar', rota('clientes.formalizar'), (req) => clientes.formalizar(req.params.id, req.body || {}));
app.delete('/api/clientes/:id', rota('clientes.excluir'), async (req, reply) => {
  // Quem excluiu vem da sessão, não do que o cliente HTTP informa.
  await clientes.excluir(req.params.id, { motivo: req.body?.motivo, usuario: `${req.user.nome} (${req.user.usuario})` });
  return reply.code(204).send();
});
app.get('/api/exclusoes', rota('exclusoes.ver'), () => clientes.listarExclusoes());

app.get('/api/clientes/:id/pdf', rota('pdf.gerar'), async (req, reply) => {
  const c = await clientes.obter(req.params.id);
  const nome = `Resumo_Onboarding_${c.erp || 'Sem_ERP'}_${c.razaoSocial}`.replace(/[^\w\-]+/g, '_');
  const doc = gerarPdf(c);
  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Disposition', `inline; filename="${nome}.pdf"`)
    .send(doc);
});

/* ------------------------- administração (usuários/grupos) ------------------------- */
app.get('/api/permissoes', somenteAdmin, async () => auth.PERMISSOES);
app.get('/api/usuarios', somenteAdmin, () => usuarios.listarUsuarios());
app.post('/api/usuarios', somenteAdmin, async (req, reply) => reply.code(201).send(await usuarios.criarUsuario(req.body || {})));
app.put('/api/usuarios/:id', somenteAdmin, (req) => usuarios.atualizarUsuario(req.params.id, req.body || {}, req.user));
app.post('/api/usuarios/:id/desbloquear', somenteAdmin, async (req, reply) => {
  await usuarios.desbloquearUsuario(req.params.id);
  return reply.code(204).send();
});
app.delete('/api/usuarios/:id', somenteAdmin, async (req, reply) => {
  await usuarios.excluirUsuario(req.params.id, req.user);
  return reply.code(204).send();
});
app.get('/api/grupos', somenteAdmin, () => usuarios.listarGrupos());
app.post('/api/grupos', somenteAdmin, async (req, reply) => reply.code(201).send(await usuarios.criarGrupo(req.body || {})));
app.put('/api/grupos/:id', somenteAdmin, (req) => usuarios.atualizarGrupo(Number(req.params.id), req.body || {}));
app.delete('/api/grupos/:id', somenteAdmin, async (req, reply) => {
  await usuarios.excluirGrupo(Number(req.params.id));
  return reply.code(204).send();
});

app.all('/api/*', rota('logado'), async (_req, reply) => reply.code(404).send({ erro: 'Rota não encontrada.' }));

// Frontend (build do Vite) servido pelo mesmo processo, com fallback para o SPA.
const publicDir = process.env.PUBLIC_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (fs.existsSync(publicDir)) {
  await app.register(fastifyStatic, { root: publicDir });
  app.setNotFoundHandler((_req, reply) => reply.sendFile('index.html'));
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida.');
  // O banco pode demorar alguns segundos a mais que o pod no cold start.
  for (let i = 1; ; i++) {
    try {
      await migrate();
      break;
    } catch (e) {
      if (i >= 10) throw e;
      app.log.warn(`Banco indisponível (${e.message}); nova tentativa ${i}/10`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  await auth.garantirAdmin(app.log);
  await app.listen({ port: Number(process.env.PORT || 3000), host: '0.0.0.0' });
}

const parar = async () => {
  await app.close();
  await pool.end();
  process.exit(0);
};
process.on('SIGTERM', parar);
process.on('SIGINT', parar);

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
