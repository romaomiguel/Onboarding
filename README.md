# Onboarding de Clientes

Sistema web para controlar o **onboarding de novos clientes** em um escritório de contabilidade: cadastro a partir do CNPJ, quadro societário, **etapas** do processo (por responsável e status), painel de acompanhamento e geração de **PDF** do cadastro — com controle de acesso por **grupos e permissões**.

> Versão pública de um projeto real de uso interno. Nomes, marcas, endereços e dados foram anonimizados.

## Funcionalidades

- **Cadastro automático por CNPJ**: consulta em cascata a APIs públicas/privadas (OpenCNPJ → NextAPI → Sintegra) com cache de 10 min e validação de dígitos verificadores.
- **Extensão de navegador** (`extensao-receita/`) como último recurso: quando as APIs não trazem a empresa ou o quadro societário, abre o site da Receita com o CNPJ preenchido; o usuário resolve o captcha e a extensão lê o cartão CNPJ e o QSA, devolvendo os dados para o sistema.
- **Clientes, sócios e CNAEs secundários** em modelo relacional.
- **Etapas do onboarding** com status e acompanhamento no dashboard (gráficos com Recharts).
- **Formalização** do cliente e **PDF** do cadastro gerado no servidor (`pdfkit`).
- **Usuários, grupos e permissões granulares** (`clientes.criar`, `etapas.editar`, `pdf.gerar`, `exclusoes.ver`...), sessões no banco e bloqueio de usuário.
- **Log de exclusões** para auditoria.
- Endpoints de saúde `/healthz` e `/readyz` para Kubernetes.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Node.js + Fastify, `pg`, `pdfkit` |
| Banco | PostgreSQL (schema criado na inicialização, protegido por *advisory lock* para múltiplas réplicas) |
| Frontend | React + TypeScript + Vite, Tailwind, Radix UI, TanStack Query, Recharts, React Router |
| Extensão | Chrome (Manifest V3) |
| Deploy | Docker multi-stage, Kubernetes (2 réplicas) |

## Como rodar

```bash
# Backend
cd backend
npm install
export DATABASE_URL="postgresql://usuario:senha@localhost:5432/onboarding"
export ADMIN_USER=admin ADMIN_PASSWORD="troque-esta-senha"
PORT=3100 npm run dev        # API em :3100 (o proxy do Vite aponta para API_URL, padrão http://localhost:3100)

# Frontend (outro terminal)
cd frontend
npm install
npm run dev                  # http://localhost:5173
```

Ou com Docker (build do frontend + backend servindo os estáticos):

```bash
docker build -t onboarding .
docker run -p 3000:3000 -e DATABASE_URL=... -e ADMIN_PASSWORD=... onboarding
```

### Variáveis de ambiente (backend)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL |
| `PORT`, `PUBLIC_DIR`, `PG_POOL_MAX` | Servidor e pool |
| `ADMIN_USER`, `ADMIN_PASSWORD`, `ADMIN_PASSWORD_FORCE` | Administrador inicial |
| `OPENCNPJ_URL` | URL da API OpenCNPJ |
| `NEXTAPI_URL`, `NEXTAPI_API_KEY` | Provedor alternativo de consulta CNPJ |
| `SINTEGRA_URL`, `SINTEGRA_API_KEY` | Provedor alternativo de consulta CNPJ |

### Extensão do navegador

Em `chrome://extensions` ative o **Modo do desenvolvedor** → **Carregar sem compactação** → escolha `extensao-receita/`. Detalhes em [`extensao-receita/README.md`](extensao-receita/README.md).

## Estrutura

```
backend/src/     server.js (rotas), auth, clientes, usuarios, opencnpj, pdf, db
frontend/src/    pages (login, dashboard, clientes, cliente-editor, admin, exclusoes) e components
extensao-receita/  extensão Chrome (consulta Receita)
k8s/             manifest de deploy e guia de criação do banco
```

## Deploy

Manifest em [`k8s/deployment.yaml`](k8s/deployment.yaml) e guia do banco em [`k8s/database.md`](k8s/database.md). O workflow `.github/workflows/deploy.yml` assume a conta `seu-usuario` — ajuste para a sua.

> O PDF gerado vem **sem cabeçalho/rodapé institucional** nesta versão pública; adicione os seus em `backend/src/pdf.js` (função `chrome`).
