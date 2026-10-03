# Banco `onboarding` no cluster Postgres (CloudNativePG)

Segue o passo 4 do manual operacional. As tabelas são criadas sozinhas pela aplicação
na inicialização (`CREATE TABLE IF NOT EXISTS`, protegido por advisory lock para as 2 réplicas).

**1. Role** — pgweb.exemplo.local → aba Query:
```sql
CREATE ROLE onboarding_user WITH LOGIN PASSWORD 'TROQUE-POR-SENHA-FORTE';
```

**2. Database** — Headlamp → Custom Resources → `databases.postgresql.cnpg.io` → namespace `bancos` → +:
```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Database
metadata:
  name: onboarding
  namespace: bancos
spec:
  cluster:
    name: pg
  name: onboarding
  owner: onboarding_user
```

**3. Secret** — Headlamp → Secrets, namespace `apps`:
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: onboarding-db-creds
  namespace: apps
stringData:
  DATABASE_URL: "postgresql://onboarding_user:SENHA@pg-rw.bancos.svc.cluster.local:5432/onboarding"
```

**4. Certificado e DNS** — acrescentar `onboarding.exemplo.local` em `dnsNames` do `wildcard-exemplo`
(kube-system) e criar o registro `onboarding.exemplo.local → 192.168.0.10` no Pi-hole.

**5. Argo CD** — nova Application `onboarding`, path `onboarding`, namespace `apps`, sync automático (Prune + Self Heal).

**6. Login** — Secret `onboarding-admin` em `apps` (criar ANTES do deploy que traz o login):
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: onboarding-admin
  namespace: apps
stringData:
  ADMIN_PASSWORD: "SENHA-DO-ADMIN-MIN-8-CARACTERES"
```
A senha só é usada para **criar** o usuário `admin` na primeira subida. Depois disso, a senha
vale a que estiver no banco (o admin a troca pela tela). Para forçar a redefinição em caso de
esquecimento, acrescente `ADMIN_PASSWORD_FORCE: "true"` no Secret, reinicie os pods e remova a chave.

**7. Chaves das APIs de CNPJ (opcional)** — Secret `onboarding-cnpj-apis` em `apps`. A consulta tenta OpenCNPJ,
depois NextAPI e depois Sintegra Brasil; provedor sem chave é pulado.
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: onboarding-cnpj-apis
  namespace: apps
stringData:
  NEXTAPI_API_KEY: "chave-da-nextapi"
  SINTEGRA_API_KEY: "chave-da-sintegra"
```
Após criar ou alterar o Secret, reinicie os pods (`Restart` do Deployment no Headlamp).
O último recurso (site da Receita) usa a extensão de `extensao-receita/`, instalada nos navegadores da equipe.

Tabelas: `clientes`, `usuarios`, `grupos`, `sessoes`, `socios`, `cnaes_secundarios`, `etapas`, `exclusoes_log` + sequence `erp_seq` (ERP a partir de 1001).
