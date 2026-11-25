# ArkoBot · Central de Administrador

O painel interno da Domma Tecnologia para operar o ArkoBot como SaaS: clientes (CPF/CNPJ), planos, créditos ArkoBot (1 crédito = R$ 0,01), cobrança pelo Asaas, integrações e auditoria. Roda **separado das instâncias dos clientes**; os limites de uso só valem quando aplicados aqui e no gateway, nunca dentro da instância.

Esta é a **Parte 1**. O provisionamento das instâncias, os computadores (VPS) e o gateway de IA vêm nas próximas partes; o banco já tem as tabelas deles.

![Visão geral](screenshots/03-visao-geral.png)

## Stack

| Peça | Escolha | Por quê |
| --- | --- | --- |
| API | [Hono](https://hono.dev) 4 em Node 22+ | Um só `app.fetch` roda igual no servidor Node (local, VPS, Docker) e numa função da Vercel; os testes chamam `app.request()` sem abrir porta. |
| Painel | React 19 + Vite + Tailwind 4 (SPA) | O mesmo conjunto do `apps/portal`; o painel é só para operadores, não precisa de SSR. O build é estático. |
| Banco | Postgres padrão via `DATABASE_URL` (`pg`) | Supabase, Neon, RDS ou o Postgres do VPS. Sem ORM: SQL explícito e migrações versionadas em `migrations/`. |
| Fila | Tabela `jobs` com `FOR UPDATE SKIP LOCKED` | Webhooks e tarefas não dependem de processo longo: o webhook grava e processa na hora; o que falhar fica na fila e o cron (`/api/cron/tick`) retoma. |
| Testes | Vitest + PGlite | Postgres de verdade compilado para WebAssembly, em memória: a suíte roda em qualquer máquina e no CI sem serviço de banco. Com `ADMIN_TEST_DATABASE_URL` a mesma suíte roda num Postgres real. |

Por que não Next.js: daria certo, mas o painel não ganha nada com SSR, e com Hono a mesma API serve a Vercel e um servidor Node comum sem adaptação (útil se o Admin for para um VPS da Domma).

## Estrutura

```
apps/admin
├── migrations/            0001_init.sql (todas as tabelas), 0002_planos_iniciais.sql
├── src/
│   ├── auth/              login por e-mail + código, sessões, TOTP, limites de taxa
│   ├── billing/           BillingProvider, Asaas (asaas.ts), webhooks, régua, máquina de estados
│   ├── credits/ledger.ts  livro de créditos imutável e idempotente
│   ├── domain/            clientes, CPF/CNPJ, efeitos de status em cliente e instâncias
│   ├── jobs/              fila em Postgres e o "tick" do cron
│   ├── security/          AES-256-GCM (SecretBox), TOTP
│   ├── server/            app Hono, rotas, entradas Node (node.ts) e Vercel (vercel.ts)
│   ├── cli/               migrate, create-admin, run-jobs, seed-demo
│   └── web/               painel React
├── test/                  testes (Vitest) e o Asaas falso
├── scripts/               dev, build da Vercel, screenshots
└── screenshots/           telas em 1440×900
```

## Rodar localmente

Requer Node 22.18+ (o repositório usa 24) e um Postgres (local, Docker ou Supabase).

```bash
pnpm install                                   # na raiz do monorepo
cp apps/admin/.env.example apps/admin/.env     # preencha (veja abaixo)
pnpm --filter admin migrate                    # cria/atualiza as tabelas
pnpm --filter admin create-admin voce@domma.com.br --name=Você
pnpm --filter admin seed:demo                  # opcional: clientes e pagamentos de exemplo
pnpm --filter admin dev                        # API em :8790 e painel em http://localhost:5190
```

Para o login, informe o e-mail; em desenvolvimento o código de 8 dígitos aparece no terminal da API (`[mailer:console]`).

Em modo "produção local": `pnpm --filter admin build && pnpm --filter admin start` serve API e painel juntos em `http://localhost:8790`.

Postgres rápido com Docker: `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=arko -e POSTGRES_USER=arko -e POSTGRES_DB=arko_admin postgres:16`.

### Variáveis de ambiente

| Variável | Obrigatória | O que é |
| --- | --- | --- |
| `DATABASE_URL` | sim | Postgres. Na Vercel use o **Transaction pooler** do Supabase (porta 6543). |
| `DATABASE_SSL` | não | `off`, `require` ou `verify`. Vazio: `off` em localhost, `require` no resto. |
| `ADMIN_ENCRYPTION_KEY` | sim | 32 bytes em base64. Cifra chaves do Asaas, tokens de webhook, chaves de IA, token da Hostinger, segredo do TOTP e segredos das instâncias. **Guarde em cofre: sem ela os segredos não abrem.** |
| `ADMIN_ENCRYPTION_KEY_PREVIOUS` | não | A chave anterior, só durante uma rotação (abre o que foi cifrado com ela). |
| `ADMIN_SESSION_SECRET` | sim | 32+ caracteres. Chave do HMAC dos códigos de login e dos limites de taxa. |
| `ADMIN_PUBLIC_URL` | sim em produção | Endereço do painel, ex.: `https://admin.arkobot.com.br`. Escritas só são aceitas vindas dessa origem; o cookie fica `Secure` quando é https. Também forma a URL do webhook. |
| `CRON_SECRET` | sim em produção | Protege `GET /api/cron/tick` (`Authorization: Bearer …`). A Vercel envia esse cabeçalho sozinha. |
| `ADMIN_CLIENT_IP_HEADER` | não | Cabeçalho com o IP real, escrito pela borda. Na Vercel já é `x-real-ip`. |
| `ADMIN_MAIL_FROM` | não | Remetente dos e-mails. |
| `DUNNING_SUSPEND_AFTER_DAYS` / `DUNNING_CANCEL_AFTER_DAYS` | não | Régua de inadimplência: 7 e 30 dias por padrão. |
| `ASAAS_API_BASE_URL` | não | Só desenvolvimento/testes: aponta o Asaas para um servidor falso. Recusado em produção. |

Gerar chaves:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"     # ADMIN_ENCRYPTION_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # ADMIN_SESSION_SECRET, CRON_SECRET
```

## Publicar (Vercel + Supabase)

1. **Banco.** Crie um projeto no Supabase. Em *Project Settings → Database*, copie a URL do **Transaction pooler** (`…pooler.supabase.com:6543/postgres`). Rode as migrações da sua máquina apontando para ela:
   ```bash
   DATABASE_URL='postgres://…:6543/postgres' pnpm --filter admin migrate
   ```
   As migrações ligam RLS em todas as tabelas sem nenhuma política: a API REST do Supabase (papéis `anon`/`authenticated`) não lê nada; o Admin conecta como dono das tabelas.
2. **Projeto na Vercel.** Importe o repositório com **Root Directory = `apps/admin`**. O `vercel.json` já define `pnpm run build:vercel`, que gera `.vercel/output` (Build Output API): o painel estático e **uma função Node** que atende `/api/*` e `/webhooks/*`, mais o cron `*/5 * * * *` em `/api/cron/tick`.
3. **Variáveis** (Production): `DATABASE_URL`, `ADMIN_ENCRYPTION_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_PUBLIC_URL`, `CRON_SECRET`, `NODE_ENV=production`.
4. **Domínio**: `admin.arkobot.com.br` → projeto. Proteja também com *Vercel Authentication* ou lista de IPs se quiser uma segunda barreira.
5. **Primeiro admin** (da sua máquina, com a `DATABASE_URL` de produção): `pnpm --filter admin create-admin seu@domma.com.br`. Depois entre e ligue o 2º fator em *Minha conta*.

Observações:
- Cron a cada 5 minutos exige plano Pro da Vercel; no Hobby o cron roda 1×/dia. Isso só atrasa retentativas e a régua, porque cada webhook já é processado na hora em que chega. Alternativa: chamar `/api/cron/tick` de outro agendador (ex.: cron do VPS) com o `CRON_SECRET`.
- Fora da Vercel: `pnpm --filter admin build && pnpm --filter admin start` (porta `PORT`, padrão 8790) atrás de um proxy https, e `pnpm --filter admin jobs -- --loop` (ou um cron chamando o tick).
- O envio de e-mail ainda é o `ConsoleMailer` (o código vai para o log da função). Antes de abrir para outros operadores, implemente a interface `Mailer` (`src/mail/mailer.ts`) com o provedor escolhido (Resend, SES, SMTP).

## Asaas

O código fala com a API v3 (`https://api.asaas.com/v3`, sandbox `https://api-sandbox.asaas.com/v3`, chave no cabeçalho `access_token`) por trás da interface `BillingProvider` (`src/billing/provider.ts`). As contas ficam na tabela `billing_accounts`; cada assinatura, pagamento e lançamento de crédito guarda o `billing_account_id` de onde veio, então dá para começar com a conta de **pessoa física** e passar para o **CNPJ da Domma** depois: basta cadastrar a nova conta e marcá-la como *ativa para novos*. Os clientes antigos continuam na conta antiga até serem migrados.

### Cadastrar a conta PF (sandbox primeiro)

1. Crie uma conta em <https://sandbox.asaas.com> (é separada da conta real) e gere a chave em *Integrações → Chaves de API* (começa com `$aact_`).
2. No painel: **Cobrança → Contas Asaas → Cadastrar conta**: titular *Pessoa física*, seu CPF, ambiente *Sandbox*, cole a chave, marque *Usar para novas assinaturas*.
3. O painel mostra **uma única vez** a URL e o token do webhook. No Asaas sandbox: *Integrações → Webhooks → Adicionar*:
   - URL: `https://admin.arkobot.com.br/webhooks/asaas/<id-da-conta>` (a que o painel mostrou);
   - Versão da API: v3; **Fila de sincronização**: ativada; tipo de envio: não sequencial;
   - **Token de autenticação**: o token mostrado (o Asaas manda no cabeçalho `asaas-access-token`);
   - Eventos: todos de **Cobranças** e de **Assinaturas**.
4. Clique em **Testar conexão** no cartão da conta. Crie um cliente de teste, inicie uma assinatura e pague-a no sandbox; o pagamento aparece em *Cobrança → Webhooks e fila* e os créditos entram no extrato do cliente.
5. Repita com a chave de produção (outra conta no painel, ambiente *Produção*) quando estiver tudo certo, e marque-a como ativa para novos.

Perdeu o token? *Novo token* no cartão da conta gera outro; atualize no Asaas.

### O que cada evento faz

| Evento | Efeito |
| --- | --- |
| `PAYMENT_CREATED` / `PAYMENT_UPDATED` | Registra a cobrança da assinatura. |
| `PAYMENT_CONFIRMED` / `PAYMENT_RECEIVED` | Pagamento confirmado: assinatura vai para *em dia*, o período avança e a **cota mensal** do plano é creditada (o que sobrou do plano no período anterior expira; créditos avulsos ficam). Compra avulsa: credita o saldo avulso. Os dois eventos para o mesmo pagamento creditam uma vez só. |
| `PAYMENT_OVERDUE` | Assinatura *em atraso*, instâncias marcadas `payment_problem`. Ignorado se o pagamento já foi confirmado (chegou fora de ordem). |
| `PAYMENT_REFUNDED` | Estorno: retira os créditos que aquele pagamento deu (até o que ainda houver no saldo). |
| `PAYMENT_CHARGEBACK_REQUESTED` / `_DISPUTE` | Retira os créditos e **suspende** o cliente (motivo chargeback). |
| `PAYMENT_DELETED` | Cobrança não paga removida. |
| `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED` | Assinatura cancelada aqui; cliente suspenso até ter outra. |

Cada evento é gravado bruto em `billing_events` (único por conta + id do evento, então reenvios do Asaas não duplicam) e processado numa transação que trava a linha: reprocessar é inofensivo. Créditos são idempotentes por `external_reference` (`payment:<id>:grant`, `payment:<id>:purchase`, …).

**Régua de inadimplência** (cron): vencida → *em atraso*; após 7 dias → cliente suspenso por cobrança (pagar reativa sozinho); após 30 dias → assinatura e cliente cancelados, com o cancelamento no Asaas feito por tarefa na fila. Suspensões manuais não são desfeitas por pagamento.

## Segurança

- Segredos (chaves de API, tokens de webhook, chaves de IA, token da Hostinger, segredo TOTP, segredo das instâncias) são cifrados com **AES-256-GCM**, IV aleatório e o contexto (tabela, coluna e id) como dado autenticado: um valor copiado para outra linha não abre. A tela mostra só uma impressão digital (12 caracteres do SHA-256).
- Login: código de 8 dígitos por e-mail, guardado como HMAC, vale 10 min e 5 tentativas; novo código substitui o anterior. Limites: 3 códigos por destinatário a cada 15 min e 5 pedidos/min por IP (a mesma regra do control plane), 10 verificações/min por IP. A resposta é igual para e-mail inexistente.
- 2º fator opcional (TOTP, qualquer aplicativo autenticador), com proteção contra reuso do código.
- Sessão: token aleatório em cookie `HttpOnly`, `Secure`, `SameSite=Strict`; o banco guarda só o hash. Expira em 12 h sem uso. Escritas precisam vir da origem `ADMIN_PUBLIC_URL`.
- Perfis: `owner` e `operator` alteram; `viewer` só lê.
- `audit_log` e `credit_ledger` têm gatilhos que recusam `UPDATE`, `DELETE` e `TRUNCATE`.
- `terms_acceptances` guarda versão, data e IP de cada aceite (o portal do cliente vai gravar; o painel mostra no detalhe do cliente).

## Planos iniciais

Criados pela migração `0002` e editáveis em **Planos**:

| Plano | Preço | Créditos/mês | Bots | Empresas | VPS incluídos |
| --- | --- | --- | --- | --- | --- |
| Essencial | R$ 159,00 | 4.000 | 3 | 1 | 0 |
| Profissional | R$ 599,00 | 20.000 | 10 | 3 | 1 |
| Empresa | R$ 999,00 | 40.000 | sem limite | sem limite | 2 |

Adicional: **computador individual (VPS)** a R$ 159,00/mês **por bot**, só nos planos pagos; muda o valor recorrente da assinatura no Asaas. Não há plano gratuito na oferta inicial, mas o modelo o suporta (`free`, modo `shared_limited`, sem navegador/computador, `idle_sleep_minutes`, `inactive_delete_days`). Todo plano tem `allow_byo_ai` (padrão ligado): o cliente pode usar a própria conta ou chave de IA, e esse uso não passa pelo gateway nem gasta créditos.

## Testes

```bash
pnpm --filter admin test                                   # PGlite (em memória)
ADMIN_TEST_DATABASE_URL=postgres://u:s@127.0.0.1/db_teste \
  pnpm --filter admin test                                 # Postgres real (cada arquivo num schema próprio)
```

Cobrem: cifra (ida e volta, adulteração, contexto, rotação de chave), TOTP (vetores do RFC 6238), login por código e seus limites, 2º fator, sessões revogadas/expiradas, permissões (anônimo, viewer, origem, cron), cliente Asaas contra um servidor falso (`test/fake-asaas.ts`), idempotência de webhook e de créditos (inclusive corrida), transições da assinatura, estorno, chargeback, régua de inadimplência, adicionais e a fila de tarefas com `SKIP LOCKED`.

Screenshots: com o painel rodando e dados de demonstração, `pnpm --filter admin screenshots` (usa o Playwright com Chromium).

## Próximas partes

- **Instâncias**: provisionar o contêiner `cloud-home` por cliente (`OMB_CLOUD_*`), nó compartilhado do modo limitado, saúde e pareamento assinados.
- **Gateway de IA**: tokens (`gateway_tokens`), débito por requisição em `usage_events`/`credit_ledger`, tetos do plano, chaves de `ai_provider_keys` por prioridade.
- **Computadores (VPS)**: interface `VpsProvider` com a Hostinger primeiro (`vps_machines`, `vps_provider_accounts`).
- `Mailer` real, troca de plano com pró-rata, emissão de NFS-e quando a conta PJ estiver ativa, portal do cliente (aceite de termos, compra de créditos).
