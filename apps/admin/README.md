# ArkoBot · Central de Administrador

O painel interno da Domma Tecnologia para operar o ArkoBot como SaaS: clientes (CPF/CNPJ), planos, créditos ArkoBot (1 crédito = R$ 0,01), cobrança pelo Asaas, integrações e auditoria. Roda **separado das instâncias dos clientes**; os limites de uso só valem quando aplicados aqui e no gateway, nunca dentro da instância.

A **Parte 1** fez o painel, a cobrança e os créditos; a **Parte 2** acrescenta o [gateway de IA](#gateway-de-ia-parte-2), que cobra os créditos da IA paga pela Domma. O mesmo deploy também serve a [Área do cliente](#área-do-cliente-contaarkobotcombr) em `conta.arkobot.com.br`. O [provisionamento automático](#provisionamento-automático-instâncias-dos-clientes) sobe o ArkoBot de cada cliente num servidor nosso; os [computadores próprios (VPS)](#computadores-próprios-vps) são comprados num provedor e recebem o ArkoBot do cliente.

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
├── migrations/            0001_init.sql (todas as tabelas), 0002_planos_iniciais.sql, … 0009_provisionamento.sql
├── src/
│   ├── auth/              login por e-mail + código, sessões, TOTP, limites de taxa
│   ├── billing/           BillingProvider, Asaas (asaas.ts), webhooks, régua, máquina de estados
│   ├── credits/ledger.ts  livro de créditos imutável e idempotente
│   ├── customer/          Área do cliente: login por código, cadastro, assinatura, créditos, LGPD (catalog.ts: termos, pacotes)
│   ├── gateway/           gateway de IA: proxy, reserva e liquidação, preços, tokens (processo próprio: node.ts)
│   ├── domain/            clientes, CPF/CNPJ, efeitos de status em cliente e instâncias
│   ├── jobs/              fila em Postgres e o "tick" do cron
│   ├── provisioning/      instâncias dos clientes: nós, estado desejado, segredos, pedidos assinados à instância
│   ├── node-agent/        agente do nó (roda na VPS com o socket do Docker; imagem própria)
│   ├── security/          AES-256-GCM (SecretBox), TOTP
│   ├── server/            app Hono, rotas, entradas Node (node.ts) e Vercel (vercel.ts)
│   ├── cli/               migrate, create-admin, run-jobs, seed-demo
│   ├── web/               painel React (index.html)
│   └── conta/             Área do cliente em React (conta.html), reaproveitando web/ui.tsx
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
pnpm --filter admin dev                        # API em :8790, painel em http://localhost:5190 e Área do cliente em http://localhost:5191
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
| `CUSTOMER_PUBLIC_URL` | não | Endereço da Área do cliente, ex.: `https://conta.arkobot.com.br` (padrão em produção; `http://localhost:5191` em desenvolvimento). Precisa ter host diferente de `ADMIN_PUBLIC_URL`. A API `/api/conta/*` só responde nesse host, e a API do painel, os webhooks e o cron nunca respondem nele. Também é lido no build da Vercel para servir `conta.html` nesse host. |
| `CUSTOMER_MAIL_FROM` | não | Remetente dos códigos da Área do cliente. Padrão: `ArkoBot <conta@arkobot.com.br>`. |
| `CRON_SECRET` | sim em produção | Protege `GET /api/cron/tick` (`Authorization: Bearer …`). A Vercel envia esse cabeçalho sozinha. |
| `ADMIN_CLIENT_IP_HEADER` | não | Cabeçalho com o IP real, escrito pela borda. Na Vercel já é `x-real-ip`. |
| `ADMIN_MAIL_FROM` | não | Remetente dos e-mails. |
| `ADMIN_ALERT_EMAIL` | não | Quem recebe os avisos de operação (servidor sem contato, instância com erro); um ou mais, separados por vírgula. Sem ela, todos os donos (`owner`) ativos do painel. |
| `RESEND_API_KEY` | sim em produção | Chave do [Resend](https://resend.com) (só envio, domínio `arkobot.com.br`). Sem ela os e-mails, inclusive os códigos de login, só vão para o log. |
| `DUNNING_SUSPEND_AFTER_DAYS` / `DUNNING_CANCEL_AFTER_DAYS` | não | Régua de inadimplência: 7 e 30 dias por padrão. |
| `ASAAS_API_BASE_URL` | não | Só desenvolvimento/testes: aponta o Asaas para um servidor falso. Recusado em produção. |
| `HETZNER_API_TOKEN` / `HOSTINGER_API_TOKEN` / `CONTABO_CLIENT_ID`, `CONTABO_CLIENT_SECRET`, `CONTABO_API_USER`, `CONTABO_API_PASSWORD` | não | Credenciais dos provedores de [computadores próprios](#computadores-próprios-vps). Sem as do provedor escolhido, nada é comprado. |
| `VPS_SSH_PUBLIC_KEYS` | não | Chaves SSH públicas do operador (separadas por `;`) postas em cada VPS nova. |
| `NODE_REGISTRY_USER` / `NODE_REGISTRY_TOKEN` | não | Só se as imagens no GHCR forem privadas: login entregue à VPS nova na inscrição. |

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
3. **Variáveis** (Production): `DATABASE_URL`, `ADMIN_ENCRYPTION_KEY`, `ADMIN_SESSION_SECRET`, `ADMIN_PUBLIC_URL`, `CRON_SECRET`, `RESEND_API_KEY`, `NODE_ENV=production`.
4. **Domínios**: `admin.arkobot.com.br` e `conta.arkobot.com.br` → o mesmo projeto (*Settings → Domains → Add*). No DNS de `arkobot.com.br`, um `CNAME` de `conta` para `cname.vercel-dns.com` (como o de `admin`). Defina `CUSTOMER_PUBLIC_URL=https://conta.arkobot.com.br` e faça um novo deploy: o build usa essa variável para mandar as páginas desse host para `conta.html`. Não ligue *Vercel Authentication* no projeto inteiro, porque a Área do cliente é pública; se quiser uma barreira extra para o painel, use regra de firewall só para o host `admin.`.
   Depois rode a migração `0005_area_do_cliente.sql` (`pnpm --filter admin migrate` com a `DATABASE_URL` de produção).
5. **Primeiro admin** (da sua máquina, com a `DATABASE_URL` de produção): `pnpm --filter admin create-admin seu@domma.com.br`. Depois entre e ligue o 2º fator em *Minha conta*.

Observações:
- Cron a cada 5 minutos exige plano Pro da Vercel; no Hobby o cron roda 1×/dia. Isso só atrasa retentativas e a régua, porque cada webhook já é processado na hora em que chega. Alternativa: chamar `/api/cron/tick` de outro agendador (ex.: cron do VPS) com o `CRON_SECRET`.
- Fora da Vercel: `pnpm --filter admin build && pnpm --filter admin start` (porta `PORT`, padrão 8790) atrás de um proxy https, e `pnpm --filter admin jobs -- --loop` (ou um cron chamando o tick).
- E-mail: com `RESEND_API_KEY` o envio é pelo Resend (`ResendMailer`); sem ela, o `ConsoleMailer` escreve o e-mail no log da função.

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
- `terms_acceptances` guarda versão, data, IP e navegador de cada aceite (gravado pela Área do cliente; o painel mostra no detalhe do cliente).

## Planos

A escada de planos: cada degrau acrescenta **um** diferencial (é a descrição do plano, que vira o título do cartão na Área do cliente). Criados pelas migrações `0002` e `0008` e editáveis em **Planos**:

| Plano | Preço | Diferencial | Créditos/mês | Bots | Empresas | VPS incluídos | Teste grátis | IA gratuita/dia |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Inicial (`inicial`) | R$ 39,00 | Assistente pessoal 24 h com IA gratuita | 0 | 1 | 1 | 0 | 7 dias | 200 requisições |
| Essencial | R$ 159,00 | Bots que trabalham sozinhos (rotinas + aprovações pelo WhatsApp) | 4.000 | 3 | 1 | 0 | — | — |
| Profissional | R$ 599,00 | Computador próprio na nuvem | 20.000 | 10 | 3 | 1 | — | — |
| Empresa | R$ 999,00 | Gestão de várias empresas | 40.000 | sem limite | sem limite | 2 | — | — |

O Inicial roda no servidor compartilhado (`cloud_mode = 'shared_limited'`), dorme após 30 min sem uso, 1 GB de RAM, 5 GB de disco, com navegador e sem computador; o Essencial também fica sem computador próprio (`computer_enabled = false`, pela `0008`). O Inicial não tem créditos: a IA dele é a **IA gratuita** do gateway (abaixo), só com os modelos marcados *grátis*; com `credits_per_month = 0` o gateway também não deixa o saldo ficar negativo (sem tolerância), então ele nunca usa IA paga "fiado".

Adicional: **computador individual (VPS)** a R$ 159,00/mês **por bot**, em todos os planos pagos (o Inicial incluído); muda o valor recorrente da assinatura no Asaas. Não há plano gratuito (`free`); o modelo continua suportando um. Todo plano tem `allow_byo_ai` (padrão ligado): o cliente pode usar a própria conta ou chave de IA, e esse uso não passa pelo gateway nem gasta créditos. Na Área do cliente, o painel sugere o próximo degrau (`PLAN_UPGRADES` em `src/customer/catalog.ts`); a troca de plano em si ainda é pelo WhatsApp.

## Teste grátis

`plans.trial_days` (0 a 90; o Inicial vem com 7) vale para qualquer plano pago. Na assinatura pela Área do cliente (`startSubscription`), se a organização **nunca teve teste nem pagou uma assinatura**:

- a assinatura nasce no Asaas com o **primeiro vencimento no fim do teste** (hoje + dias, data de Brasília);
- aqui ela fica `active` na hora, com `current_period_end` e `trial_ends_at` = fim do teste, e recebe os créditos do plano proporcionais aos dias (`ceil(cota × dias ÷ 30)`, referência `trial:<id>`; 0 no Inicial). O primeiro pagamento credita a cota cheia e expira o que sobrou do teste;
- **um teste por organização e por CPF/CNPJ**: `subscription_trials` (chave primária = documento, `organization_id` único) guarda cada teste para sempre, mesmo que a assinatura seja cancelada ou o documento da organização seja corrigido. Quem já pagou uma assinatura também não ganha teste.

Se a primeira cobrança não for paga, vale a régua normal: o `PAYMENT_OVERDUE` do Asaas leva a `past_due`, depois `suspended` e `canceled`. Se o aviso do Asaas não chegar, o cron marca o teste vencido e não pago como atrasado `TRIAL_GRACE_DAYS` (2) dias depois do fim. **Cancelar durante o teste** cancela no Asaas antes de qualquer cobrança, marca a fatura pendente como cancelada e não gera reembolso (a auditoria grava `duringTrial`).

A Área do cliente mostra "N dias grátis" no plano (só para quem ainda pode testar), o botão "Começar N dias grátis" e, no painel, "Teste grátis até dd/mm — a primeira cobrança vem em dd/mm". A ficha do cliente no painel mostra *Teste grátis até*.

## IA gratuita (plano Inicial)

O cliente do Inicial não precisa configurar nenhuma IA: o gateway atende com os **planos gratuitos** de provedores compatíveis com a API da OpenAI, nas contas da Domma.

- **Provedores**: Groq (`https://api.groq.com/openai/v1`), Google AI Studio/Gemini (`https://generativelanguage.googleapis.com/v1beta/openai`), NVIDIA (`https://integrate.api.nvidia.com/v1`), OpenRouter (só modelos `:free`) e Cerebras (`https://api.cerebras.ai/v1`, ainda sem chave: é pulado).
- **Chaves**: em **Integrações** (várias por provedor, por prioridade; a tela já preenche a URL base) e/ou nas variáveis do host do gateway `GROQ_API_KEY`, `GEMINI_API_KEY`, `NVIDIA_API_KEY`, `OPENROUTER_API_KEY` (`CEREBRAS_API_KEY` opcional). As do ambiente vêm depois das de Integrações e só servem os modelos grátis. Nenhuma chave vai para log ou para o banco em claro.
- **Modelos**: linhas de **Preços** com `free = true` (preço zero, `CHECK` no banco) e `upstream_model` (o id no provedor). A `0008` semeia os que responderam em 2026-11-26: `openai/gpt-oss-120b` (Groq), `gemini-3.8-flash`, `moonshotai/kimi-k3.1-pro` (NVIDIA), `nvidia/nemotron-3.5-super-vl:free` e `google/gemma-4-31b-it:free` (OpenRouter), `gpt-oss-120b` (Cerebras). `ARKOBOT_FREE_MODEL_<GROQ|GEMINI|NVIDIA|OPENROUTER|CEREBRAS>` troca o modelo de um provedor sem mexer na tabela. No OpenRouter, qualquer id sem `:free` é **bloqueado no código** (e por um `CHECK` no banco), porque seria cobrado da conta.
- **Ordem e queda**: o modelo pedido primeiro; se o provedor responder 429/5xx/401, não responder em `ARKOBOT_FREE_TIMEOUT_MS` (30 s) ou estiver sem vez no ritmo por minuto, passa para a próxima chave e depois para o próximo provedor, na ordem `ARKOBOT_FREE_AI_ORDER` (padrão `groq,gemini,nvidia,openrouter`). Ritmo por provedor neste processo: `ARKOBOT_FREE_RPM_<PROVEDOR>` (padrões 30, 10, 40, 20, 30). Se nenhum atender: `503 free_ai_unavailable` ("A IA gratuita está sobrecarregada agora…").
- **Limite por cliente**: `plans.free_requests_per_day` (Inicial: 200; 0 = sem IA gratuita, o padrão dos outros planos), por dia de Brasília: `429 free_daily_limit_reached` ("Limite diário da IA gratuita atingido — volta amanhã, ou faça upgrade / conecte sua própria IA"). Modelos grátis custam **0 crédito e não reservam** nada; ficam em `usage_events` com `provider`, `upstream_model` e `duration_ms` (e uma linha de log com provedor, modelo e latência). A ficha do cliente mostra *IA gratuita hoje*.
- **Na instância**: o catálogo (`/v1/models`) apresenta esses modelos como `provider: "openrouter"` (com `upstream_provider`), porque a instância só conhece os motores Anthropic, OpenAI e OpenRouter; o gateway aceita qualquer modelo compatível com OpenAI no caminho `/v1/openrouter/…`. Por isso os ids na tabela têm barra (`gratis/…`).
- **Conferir as chaves**: `pnpm --filter admin ia:testar` lê as quatro variáveis (do ambiente ou de `apps/admin/.env`), manda "Olá" a cada provedor com o modelo configurado e mostra OK/erro, status HTTP, latência e o começo da resposta, nunca a chave. Pula quem está sem chave.

**Atenção aos termos dos provedores.** Os planos gratuitos (Google AI Studio, catálogo de API da NVIDIA, modelos gratuitos do OpenRouter, Groq, Cerebras) têm limites de uso **compartilhados por toda a conta da Domma** e podem restringir uso comercial ou em produção, ou usar os dados enviados para treinar modelos. Confira os termos de cada um antes de vender o Inicial em escala. Se os gratuitos não bastarem, dá para trocar o Inicial para um modelo pago barato (ex.: `claude-haiku-5-5`) editando o plano: ponha o modelo em *Modelos permitidos* e dê créditos ao plano (`credits_per_month`), senão o gateway recusa com `402`.

## Testes

```bash
pnpm --filter admin test                                   # PGlite (em memória)
ADMIN_TEST_DATABASE_URL=postgres://u:s@127.0.0.1/db_teste \
  pnpm --filter admin test                                 # Postgres real (cada arquivo num schema próprio)
```

O gateway tem `test/gateway.test.ts` e `test/gateway-admin.test.ts`, com um provedor falso (`test/fake-ai.ts`: SSE da Anthropic e da OpenAI com usage, Responses, OpenRouter com custo): repasse do stream sem alteração, reserva e liquidação, concorrência (rajada de requisições simultâneas não estoura o saldo; rode também com `ADMIN_TEST_DATABASE_URL` para travas reais do Postgres), corte 402, tolerância negativa, modelo fora do plano, token revogado, plano suspenso/em atraso, idempotência, erro do provedor, troca de chave, cliente que cai no meio, tetos, avisos, rate limit, expiração de reservas e as telas do painel.

Cobrem: cifra (ida e volta, adulteração, contexto, rotação de chave), TOTP (vetores do RFC 6238), login por código e seus limites, 2º fator, sessões revogadas/expiradas, permissões (anônimo, viewer, origem, cron), cliente Asaas contra um servidor falso (`test/fake-asaas.ts`), idempotência de webhook e de créditos (inclusive corrida), transições da assinatura, estorno, chargeback, régua de inadimplência, adicionais e a fila de tarefas com `SKIP LOCKED`.

A Área do cliente tem `test/customer.test.ts`: login por código e limites, separação de hosts (cookie do cliente não abre o painel e vice-versa, origem das escritas), validação do cadastro e gravação dos aceites, cadastro → assinatura no Asaas falso → fatura → webhook, compra de créditos, computadores adicionais, cancelamento, exportação, pedido de exclusão e isolamento entre organizações.

O plano Inicial tem `test/trial.test.ts` (teste grátis: vencimento no Asaas, assinatura ativa, texto do painel, créditos proporcionais, um teste por organização e por CPF/CNPJ, régua depois do teste, cancelamento durante o teste) e `test/free-ai.test.ts` (IA gratuita: catálogo, 0 crédito sem reserva, limite diário, troca de chave e de provedor, chaves/ordem/modelo/ritmo/tempo pelo ambiente, bloqueio de OpenRouter sem `:free`, Inicial fora dos modelos pagos e sem tolerância negativa, planos pagos como antes). `test/plans.test.ts` confere que a `0008` roda de novo sem mudar nada.

A cortesia tem `test/courtesy.test.ts`: liberação com créditos na hora, recusa com assinatura paga, troca da assinatura pendente (cancelada no Asaas pela fila), renovação mensal idempotente, fim pela data (dia de Brasília) e pelo operador, régua que não a toca, permissões e o que a Área do cliente mostra.

Screenshots: com o painel rodando e dados de demonstração, `pnpm --filter admin screenshots` (usa o Playwright com Chromium).

## Área do cliente (conta.arkobot.com.br)

O cliente se cadastra, assina e acompanha a conta sozinho. Roda no **mesmo deploy** do painel, separado pelo host:

| | Painel (`admin.`) | Área do cliente (`conta.`) |
| --- | --- | --- |
| Página | `index.html` (`src/web`) | `conta.html` (`src/conta`) |
| API | `/api/*`, `/webhooks/*`, `/api/cron/*` | só `/api/conta/*` |
| Cookie | `arko_admin_session`, `SameSite=Strict` | `arko_conta_session`, `SameSite=Lax` |
| Escritas aceitas da origem | `ADMIN_PUBLIC_URL` | `CUSTOMER_PUBLIC_URL` |

Os dois cookies são `HttpOnly`, `Secure` e sem `Domain` (valem só no próprio host), e o banco guarda só o hash do token. Em qualquer outro host a API do cliente responde 404; no host do cliente, a do painel também. `Lax` no cliente é para ele continuar logado ao voltar da página de pagamento do Asaas.

**Fluxo**
1. **Entrar / criar conta** (`/entrar`, `/cadastro?plano=inicial|essencial|profissional|empresa`): só e-mail; código de 8 dígitos com as mesmas regras e limites do login do painel (3 códigos por e-mail a cada 15 min, 5 pedidos/min e 10 verificações/min por IP, 5 tentativas, 10 min). A conta (`accounts`) só é criada quando o código confere. Sessão de 7 dias, renovada com o uso.
2. **Boas-vindas**: nome, celular, empresa (CPF ou CNPJ com dígitos verificadores) e o aceite obrigatório dos [Termos de Uso](https://arkobot.com.br/termos/) e da [Política de Privacidade](https://arkobot.com.br/privacidade/). Cada documento vira uma linha em `terms_acceptances` com versão, IP (`ADMIN_CLIENT_IP_HEADER`/`x-real-ip`) e navegador. Cria a organização com a conta como `owner`. As versões ficam em `src/customer/catalog.ts` (`LEGAL_DOCUMENTS`, hoje `2026-11-25`); um teste confere com a data "em vigor a partir de" dos textos em `apps/site/conteudo/legal/`. **Ao mudar um texto, mude a data lá**: quem aceitou a versão anterior precisa aceitar de novo no próximo acesso.
3. **Plano**: plano (pré-escolhido pelo site), computadores adicionais (R$ 159/mês cada) e Pix, boleto ou cartão. Cria a assinatura no Asaas pela conta *ativa para novos* (`startSubscription` + `setSubscriptionAddon`) e mostra o link da primeira fatura. O cartão é digitado na página do Asaas; nunca passa por aqui. Sem conta Asaas ativa, a tela diz que os pagamentos ainda não estão disponíveis e leva ao WhatsApp.
4. **Painel**: situação da assinatura (pendente, em dia, em atraso, suspensa, cancelada) com o próximo passo, pagamentos com o link da fatura/boleto/Pix, saldo de créditos (plano e avulsos) e extrato, compra de pacotes de créditos (`CREDIT_PACKAGES`: 5.000, 10.000 e 25.000 créditos = R$ 50, R$ 100 e R$ 250), quantidade de computadores adicionais, cancelamento (com motivo; marca na auditoria se foi dentro dos 7 dias de arrependimento, para o reembolso manual), exportação dos dados (JSON) e pedido de exclusão.

**Pedido de exclusão**: grava `account_deletion_requests` e a auditoria; nada é apagado sozinho. No painel, a ficha do cliente mostra um aviso e a aba *Pedidos de exclusão*, onde o operador registra o que fez (*Atendido* ou *Recusado*). Pagamentos, notas, o extrato de créditos e a auditoria ficam pelo prazo legal.

Cada cliente só enxerga a própria organização: nenhuma rota recebe id de organização; tudo sai da `memberships` da conta da sessão. Um membro (`member`) só lê; mudanças de cobrança são do `owner`/`admin`. Cada conta pode gerar até 10 cobranças por hora.

Em desenvolvimento, `pnpm --filter admin dev` abre a Área do cliente em `http://localhost:5191` (use `localhost`, não `127.0.0.1`, porque a API compara o host com `CUSTOMER_PUBLIC_URL`).

## Cortesia

Para liberar um plano **sem cobrança** (parceiro, teste estendido, compensação): na ficha do cliente, **Liberar sem cobrança (cortesia)** → plano, *Válida até* (padrão *Sem prazo*) e motivo (obrigatório). Só `owner` e `operator`; o `viewer` não vê o botão e a API recusa. Precisa da migração `0006_cortesia.sql` (`pnpm --filter admin migrate`).

- Cria uma assinatura `active` marcada `courtesy`, com preço 0, sem conta Asaas e sem assinatura no Asaas (um `CHECK` do banco garante isso), período de agora a +1 mês e a cota do plano creditada na hora (`courtesy:<id>:<início do período>`). Se o cliente estava suspenso por cobrança ou assinatura encerrada, volta a ficar ativo. A auditoria guarda quem liberou e o motivo.
- Assinatura **paga** em andamento (em dia, em atraso ou suspensa): recusa; cancele-a antes, para nunca derrubar um cliente pagante sem querer. Assinatura **aguardando o 1º pagamento** (por exemplo, criada na Área do cliente): é cancelada aqui, as faturas em aberto viram canceladas e o cancelamento no Asaas sai pela fila (`billing.cancel_provider_subscription`).
- **Renovação** no cron: ao fim de cada período, a cota do mês seguinte entra como numa renovação paga (o que sobrou do plano expira, avulsos ficam), uma vez por período. A régua de inadimplência ignora cortesias.
- **Fim**: no dia seguinte a *Válida até* (horário de Brasília) ou em **Encerrar cortesia** (com motivo), a assinatura é cancelada ("Cortesia encerrada") e o cliente fica suspenso por assinatura encerrada, como num `SUBSCRIPTION_DELETED`; na Área do cliente aparece *Assinar de novo*. Os créditos que sobraram continuam no saldo.
- Computadores adicionais não entram na cortesia: os adicionais entram no valor da assinatura e no MRR, e a cortesia não tem cobrança. Os incluídos no plano valem normalmente.
- **Área do cliente**: conta como assinatura em dia (painel, créditos e gateway funcionam) e mostra "Plano X — cortesia (sem cobrança)" e a data final, sem valor, faturas nem forma de pagamento. Cancelar e mudar computadores mandam falar com a equipe pelo WhatsApp; comprar créditos avulsos segue a regra de sempre (precisa de conta Asaas ativa).
- Na Visão geral a cortesia não conta como pagante; as listas de clientes e de assinaturas mostram o selo *cortesia*.

## Relatórios (@devs)

Quando alguém escreve `@devs` numa conversa do app ArkoBot (desktop ou servidor), o app manda um relatório de problema para esta Central. Precisa da migração `0007_relatorios.sql`.

- **Entrada pública** (sem login, como os webhooks; só no host do painel): `POST /webhooks/bug-reports` com `{ installId, source: "bot", description, appVersion, platform, diagnostics, contactEmail?, contact? }` responde `201 { id }`; `400 { error }` para dados inválidos (um e-mail ruim cita o campo `contact`, e o app reenvia sem ele); `413` acima de 600 KB; `429 { error, retryAfter }` (e `Retry-After`) depois de 20 relatórios por IP por hora. `POST /webhooks/bug-reports/status` com `{ installId, ids }` responde se cada relatório desta instalação chegou (`received`) ou não (`unknown`), com `notify: false`.
- Nada que chega é confiável: o esquema é validado, campos desconhecidos são descartados, `NUL` é removido, o tamanho é limitado na API e no banco. O painel mostra o texto sem interpretá-lo.
- **Painel → Relatórios**: lista por situação (novo, visto, fechado), abre o relato e o diagnóstico, e `owner`/`operator` mudam a situação; cada mudança vai para a Auditoria (`bug_report.status_changed`).
- No app: sem `OMB_BUG_REPORT_URL` os relatórios vêm para `https://admin.arkobot.com.br/webhooks/bug-reports`; `OMB_BUG_REPORT_URL=off` guarda só na pasta de dados; outro endereço https manda para lá.

## Gateway de IA (Parte 2)

A IA paga pela Domma passa por um gateway que é o **único lugar confiável** para os limites: a instância do cliente não é confiável, então ela só recebe um token (`arko_ai_…`) e manda tudo para o gateway, que confere plano, modelo, saldo e tetos, repassa ao provedor com as chaves da Domma (`ai_provider_keys`) e debita os créditos. O uso com a conta ou chave do próprio cliente (`allow_byo_ai`) não passa por aqui e não gasta créditos.

![Consumo de IA](screenshots/20-consumo.png)

### Onde roda e por quê

O gateway é um **processo Node separado** (`src/gateway/node.ts`), no mesmo pacote do Admin porque usa o mesmo banco e os mesmos módulos (livro de créditos, cifra das chaves, planos). Ele **não** roda na Vercel: uma resposta em streaming de um agente pode durar muitos minutos, e uma função serverless corta em 60–300 s, o que cortaria a resposta no meio e deixaria a liquidação para trás. No VPS da Domma ele fica atrás de um proxy HTTPS (o Caddy do `deploy/`) que não faz buffer do SSE. O painel continua na Vercel; os dois falam só pelo Postgres.

```
instância ArkoBot ──(token arko_ai_…)──▶ gateway (VPS) ──(chave da Domma)──▶ Anthropic / OpenAI / OpenRouter
                                          │  reserva → repassa o stream sem mexer → lê o usage → liquida
                                          ▼
                                       Postgres (o mesmo do Admin) ◀── painel (Vercel): consumo, preços, tokens
```

### Endpoints

| Rota | O que faz |
| --- | --- |
| `POST /v1/anthropic/v1/messages` | Messages API (com ou sem `stream`). `…/v1/messages/count_tokens` é repassado sem cobrar. |
| `POST /v1/openai/v1/chat/completions` e `/v1/openai/v1/responses` | Chat Completions e Responses (com streaming). |
| `POST /v1/openrouter/v1/chat/completions` | OpenRouter e, para a instância, qualquer modelo compatível com OpenAI da tabela (Gemini, NVIDIA, Groq, Cerebras). |
| `POST /v1/{google,nvidia,groq,cerebras}/v1/chat/completions` | Direto num provedor compatível com OpenAI. |
| `GET /v1/models` (e `/v1/{provedor}/v1/models`) | O catálogo do plano: modelos da tabela de preços permitidos pelo `allowed_models` do plano, mais `organization` e `usable`. |
| `GET /health` | Saúde (consulta o banco). |

Autenticação: `Authorization: Bearer arko_ai_…` ou `x-api-key` (o Claude Code manda um dos dois). O token é guardado só como SHA-256 e resolve cliente e instância. Cabeçalhos opcionais: `X-Arko-Company` e `X-Arko-Bot` (atribuição no painel) e `X-Arko-Request-Id` (idempotência: o mesmo id duas vezes dá `409 duplicate_request`). A resposta traz `X-Arko-Request-Id`.

O corpo e o stream da resposta vão ao cliente **byte a byte como o provedor mandou**. O gateway só mexe no pedido para: pedir o uso no stream (`stream_options.include_usage` na OpenAI/OpenRouter, `usage.include` no OpenRouter) e baixar `max_tokens`/`max_output_tokens` quando o saldo ou o teto por requisição não pagam o pedido inteiro.

### Créditos: reserva e liquidação

1. **Reserva** (`credit_reservations`), numa transação que trava a carteira do cliente: estimativa = entrada (bytes do pedido ÷ 4, a preço de entrada) + `max_tokens` × preço de saída, convertida em créditos. O disponível é `saldo − reservas ativas + tolerância negativa`; duas requisições simultâneas passam uma de cada vez por essa trava, então a segunda vê a reserva da primeira e não gasta os mesmos créditos. Saldo ≤ 0: `402 credits_used_up` na hora.
2. **Repasse** ao provedor, pela chave de maior prioridade; 401/429/5xx antes de qualquer byte ao cliente passa para a próxima chave.
3. **Liquidação** ao fim do stream (ou da resposta), lendo o `usage`: Anthropic `message_start` + `message_delta.usage` (entrada, cache lido, cache escrito, saída); OpenAI `usage` do último chunk / `response.completed`; OpenRouter `usage.cost` (o custo informado pelo provedor tem prioridade). Custo em US$ × câmbio × (1 + markup) → créditos, arredondado para cima. Débito no `credit_ledger` (imutável) primeiro do saldo do plano e depois do avulso (que pode ficar negativo até a tolerância), com referência `usage:<request_id>:plan|extra`: liquidar duas vezes não debita duas vezes. A sobra da reserva volta (a reserva é marcada `settled`).
4. Se o cliente cai no meio do stream, cobra-se o que o provedor já informou mais uma estimativa da saída pelos bytes entregues (`usage_estimated` no painel). Erro do provedor: nada é cobrado, a reserva é liberada e o status/corpo do provedor vão ao cliente. Reservas de um gateway que caiu expiram no cron (`/api/cron/tick`).

Tetos do plano: **diário** (dia de Brasília), **mensal** (no período da assinatura) e **por requisição** (baixa o `max_tokens`; se nem a entrada cabe, `400 request_over_plan_limit`). Rate limit por cliente (requisições/minuto, `429` com `Retry-After`). Avisos de **50, 80 e 100%** da cota do período ficam em `usage_alerts` e na auditoria, uma vez por período; o e-mail ao cliente entra pela interface `UsageAlertNotifier` (`src/gateway/alerts.ts`), em cima do `Mailer`, quando o provedor de e-mail for escolhido.

Recusas (corpo JSON `{ code, message, type, error }`, mensagem em pt-BR):

| Status | `code` | Quando |
| --- | --- | --- |
| 401 | `invalid_token` | Token desconhecido, revogado ou expirado. |
| 402 | `plan_suspended` | Cliente suspenso/cancelado ou assinatura que não está em dia (em atraso, suspensa, aguardando 1º pagamento). |
| 402 | `credits_used_up` | Saldo acabou (ou não cobre nem a entrada). |
| 402 | `daily_cap_reached` / `monthly_cap_reached` | Teto do plano. |
| 400 | `request_over_plan_limit` | Pedido maior que o teto por requisição. |
| 403 | `model_not_in_plan` / `model_unavailable` | Modelo fora do plano / desativado ou de outro provedor. |
| 409 | `duplicate_request` | `X-Arko-Request-Id` repetido. |
| 429 | `rate_limited` | Limite por minuto. |
| 429 | `free_daily_limit_reached` | Limite diário da IA gratuita do plano. |
| 503 | `free_ai_unavailable` | Nenhum provedor gratuito atendeu (todos no limite ou fora do ar). |

### Painel

- **Consumo de IA**: requisições, custo real da Domma (R$ e US$), créditos cobrados e margem, por cliente, empresa, bot e modelo, recusas por motivo e as últimas requisições. Filtra por período e por cliente (`/consumo?cliente=<id>`).
- **Tabela de preços**: preço por modelo (entrada, saída, cache lido/escrito, US$ por milhão), markup próprio opcional, saída máxima estimada, ativo/inativo, e os gerais: markup, câmbio R$/US$, tolerância negativa, requisições/minuto e validade da reserva. Partiu de `server/model-prices.ts` (migração `0003`). Tudo auditado.
- **Ficha do cliente → Gateway de IA**: emitir token (mostrado uma única vez) por instância, revogar com motivo, consumo dos últimos 30 dias.
- A Visão geral perdeu o cartão "Gratuitos" (não há plano grátis) e ganhou "Margem de IA (mês)".

![Tabela de preços](screenshots/24-tabela-de-precos.png)

### Rodar o gateway

Local: `pnpm --filter admin gateway` (porta `GATEWAY_PORT`, padrão 8791; usa `DATABASE_URL` e `ADMIN_ENCRYPTION_KEY` do `.env`).

No VPS (Docker + Caddy com HTTPS automático):

```bash
cd apps/admin/deploy
cp gateway.env.example gateway.env        # DATABASE_URL e ADMIN_ENCRYPTION_KEY: as mesmas do Admin
GATEWAY_DOMAIN=ia.arkobot.com.br docker compose -f gateway.compose.yml up -d --build
```

A imagem (`Dockerfile.gateway`) leva só o gateway empacotado num arquivo (`pnpm --filter admin build:gateway` → `dist/gateway/gateway.mjs`) e o Node 24. Use a conexão direta ou o *Session pooler* do Supabase (processo longo). Sem Docker: `node dist/gateway/gateway.mjs` atrás de qualquer proxy HTTPS que não faça buffer de `text/event-stream`. Ao receber SIGTERM o gateway espera os streams em andamento liquidarem antes de sair.

**Modelos pagos só com chave.** Um modelo pago só aparece no catálogo (`/v1/models`) e só é atendido (senão `403 model_unavailable`, antes de reservar crédito) quando o provedor dele (`model_prices.provider`) tem uma chave **ativa** em **Integrações**. Por isso a `0011` já pôs GPT e Gemini nos planos — Essencial: `claude-haiku-5-5`, `gpt-5.4-mini`, `google/gemini-2.5-flash`; Profissional: esses + `claude-sonnet-5`, `gpt-5.4`, `google/gemini-3.1-pro-preview`; Empresa: esses + `claude-opus-5`, `gpt-5.5`, `x-ai/grok-4.7` —, e eles aparecem sozinhos quando o dono cadastrar as chaves da OpenAI e do OpenRouter. Os modelos grátis seguem a regra deles (chaves de Integrações ou do ambiente).

Depois: cadastre as chaves da Domma em **Integrações** (Anthropic, OpenAI, OpenRouter e, para a IA gratuita, Groq, Google AI Studio, NVIDIA; ou as variáveis `*_API_KEY` do `gateway.env`), confira a **Tabela de preços** e os `allowed_models` dos **Planos**, e emita um token na ficha do cliente.

### Lado da instância

No servidor do ArkoBot, `OMB_CLOUD_AI_GATEWAY_URL` (raiz do gateway, https) e `OMB_CLOUD_AI_GATEWAY_TOKEN` (o `arko_ai_…`) ligam o caminho "gateway ArkoBot" (`server/hosted-models.ts`): a instância lê `/v1/models` e registra os motores **ArkoBot · Claude** (Claude Code com `ANTHROPIC_BASE_URL` no gateway), **ArkoBot · Codex** e **ArkoBot · OpenRouter** ao lado dos motores do dono, que continuam funcionando como antes. O token segue o caminho dos tokens incluídos: chega pelo pipe de segredos do Cloud, sai do ambiente do servidor na partida, nunca vai para `config.json` nem aparece na lista de motores. Como nos motores de empresa, o processo do Claude Code/Codex recebe o token no próprio ambiente para falar com o gateway; um token vazado só gasta os créditos do próprio cliente e é revogado na ficha. Um 402/403 do gateway vira uma nota no chat ("Os créditos de IA do seu plano acabaram…", traduzida), com o botão para conectar a própria IA. O catálogo é relido a cada 15 minutos; token revogado tira os motores.

## Provisionamento automático (instâncias dos clientes)

Quando um cliente assina (ou começa o teste grátis do Inicial, ou recebe uma cortesia), o ArkoBot dele sobe sozinho num servidor nosso, já ligado ao gateway de IA com os limites do plano, e o cliente abre pela Área do cliente com **Abrir meu ArkoBot**. Suspensão ou cancelamento param a instância; o pagamento em dia liga de novo. Os dados ficam num volume Docker que nunca é apagado sozinho.

### Como funciona

```
Asaas/teste/cortesia ──► Admin (Vercel + Postgres) ◄── GET /api/agent/v1/desired ──── agente do nó (VPS, socket do Docker)
                          instâncias: estado, segredos      POST /api/agent/v1/status ──►  │ cria / para / remove contêineres
                          cifrados, token de IA                                            ▼
Cliente ── conta.arkobot.com.br ── "Abrir" ──► Admin assina POST /api/cloud/pairing ──► https://<slug>.arkobot.com.br (Traefik → contêiner cloud-home)
```

- **Quem dispara**: `applySubscriptionSignal` (assinatura ficou ativa), o início do teste grátis, a cortesia, o plano gratuito e a reativação do cliente enfileiram `instance.provision`. Como rede de segurança, o cron (`/api/cron/tick`) e **cada consulta do agente** varrem quem tem assinatura ativa/em atraso e ainda não tem instância. A Área do cliente também provisiona na hora ao abrir o painel.
- **Instância** (`src/provisioning/instances.ts`): uma por organização (`instances_one_live_per_org`), `slug` a partir do slug do cliente (nomes reservados como `admin`, `conta`, `ia` ganham `-bot`; repetidos ganham `-2`, `-3`…), `machine_id` = id da instância, segredo de bootstrap (256 bits) e token `arko_ai_…` do gateway, **os dois cifrados** com `ADMIN_ENCRYPTION_KEY` (o agente precisa deles a cada recriação). Vai para o servidor ativo com menos instâncias que ainda tenha vaga (`capacity_instances`); sem vaga, espera e entra assim que houver.
- **Estado**: a cobrança move `state` como antes (`domain/lifecycle.ts`). O desejado é `running`, menos quando `stopped`/`failed` ou parada pelo operador (`stopped`) e quando desativada (`absent`: remove o contêiner, nunca o volume). Quando o agente informa "rodando e saudável", `setting_up` vira `ready` e a instância aprende o plano (`POST /api/cloud/plan` assinado → limite de bots).
- **Agente** (`src/node-agent`, imagem `ghcr.io/otaviobmarques/arkobot-node-agent`): a cada 15 s lê o estado desejado, acerta o Docker e devolve o que viu. Só toca em contêineres com `arkobot.managed=true` **e** `arkobot.node=<este nó>`; contêineres com a etiqueta que o Admin não pediu aparecem como "sem instância" no painel e ficam como estão. Admin fora do ar: não muda nada (as instâncias seguem pelo `restart: unless-stopped`). Mudou a configuração (imagem, plano, segredo, "Reprovisionar")? Recria o contêiner com o mesmo volume.
- **Contêiner** (`src/node-agent/spec.ts`): a imagem **cloud-home** (`ghcr.io/otaviobmarques/sistema-otavio-bot-cloud-home:latest`, alvo `cloud-home` do Dockerfile, publicada pelo `docker.yml`). A `sistema-otavio-bot:latest` é o servidor auto-hospedado e não tem o modo Cloud home. Volume `arkoinst-<id>-data` em `/data`, memória do plano (`ram_mb`, sem swap), CPU (1 por 2 GB, de 0,5 a 4), limite de processos, `init`, `shm` de 512 MB, log com rotação, **sem socket do Docker, sem bind mount, sem privilégio**. Rede `arkobot-instances` (só as instâncias e o Traefik), etiquetas do Traefik para `Host(<slug>.arkobot.com.br)`, `websecure`, `letsencrypt`, porta 8080, sem buffer (stream de eventos).
- **Variáveis da instância** (o contrato do Cloud home, `docs/cloud-pro.md`): `OMB_CLOUD_ROLE=home`, `OMB_CLOUD_MACHINE_ID`, `OMB_CLOUD_ADMIN_URL=https://conta.arkobot.com.br`, `OMB_PUBLIC_URL=https://<slug>.arkobot.com.br`, `OMB_CLOUD_BOOTSTRAP_SECRET`, `OMB_CLOUD_AI_GATEWAY_URL=https://ia.arkobot.com.br` + `OMB_CLOUD_AI_GATEWAY_TOKEN` (a instância lê `/v1/models` e só vê os modelos do plano: os `gratis/…` no Inicial), `OMB_CLOUD_EDGE_HOLD=30s`, `OMB_CLOUD_TRUSTED_PROXIES` (a sub-rede da rede das instâncias, onde está o Traefik) e `TZ`. O supervisor da imagem tira os segredos do ambiente do servidor e os passa por um pipe; nada disso vai para log.
- **Primeiro acesso (e todos os outros)**: "Abrir meu ArkoBot" pede à instância, num pedido assinado com o segredo de bootstrap, um **login de navegador de uso único** (`purpose: "browser"`, dono = e-mail do cliente, 2 min) e abre `https://<slug>.arkobot.com.br/pair#signin=omb_pair_…` numa aba nova. A credencial só existe no fragmento da URL (não chega a servidor nem a log) e vale uma vez; a instância mostra de quem é o ArkoBot e pede um **Continuar**. Só o dono ou admin da organização abre por aqui.
- **Limite de bots**: o Admin diz o plano à instância (`POST /api/cloud/plan {"v":1,"tier":"<código do plano>"}`) e o servidor aplica `PLAN_BOT_LIMITS` (`server/host/starter-bot-limit.ts`): Inicial 1, Essencial 3, Profissional 10, Empresa sem limite (o MausBot não conta). O Inicial também vale como "Starter" (2 turnos ao mesmo tempo, 1 conversa por bot).
- **Painel → Instâncias**: servidores (online, versão do agente, erros, contêineres sem instância) e as instâncias de cada cliente com estado, servidor, endereço e o que o agente viu; ações **Parar/Ligar**, **Reprovisionar** (baixa a imagem e recria) e **Desativar** (remove o contêiner e revoga o token de IA; o volume fica). Cadastro de servidor e troca de token só para o dono.

### Colocar no ar (passo a passo)

1. **Migração** (da sua máquina, com a `DATABASE_URL` de produção): `pnpm --filter admin migrate` aplica `0009_provisionamento.sql` (só acrescenta colunas e índices).
2. **DNS**: registro `A` curinga `*.arkobot.com.br` → `200.141.20.53`. Os registros que já existem (`admin`, `conta`, `ia`…) continuam valendo, porque são mais específicos. Cada instância nova pede o próprio certificado ao Let's Encrypt pelo Traefik (limite de 50 por semana por domínio; para passar disso, um certificado curinga com desafio DNS no Traefik).
3. **Rede das instâncias** (uma vez, na VPS): `docker network create arkobot-instances` e ligue o Traefik a ela: `docker network connect arkobot-instances <contêiner do Traefik>`; para sobreviver a um `docker compose up` do Traefik, acrescente a rede `arkobot-instances` (externa) ao compose dele. Assim as instâncias ficam fora da `traefik-edge` dos outros projetos. Se preferir não mexer no Traefik, use `ARKO_INSTANCE_NETWORK=traefik-edge`, sabendo que aí as instâncias enxergam os outros contêineres dessa rede.
4. **Cadastrar o servidor** e copiar o token (aparece uma vez): Admin → **Instâncias → Cadastrar servidor**, ou `pnpm --filter admin create-node vps-hostinger-1 --capacity=20 --ip=200.141.20.53`. Para trocar o token: botão **Novo token** ou `create-node vps-hostinger-1 --rotate`.
5. **Agente na VPS**: projeto Docker `arkobot-node-agent` com `apps/admin/deploy/node-agent.vps.compose.yml` e um `.env` com `ARKO_ADMIN_URL=https://admin.arkobot.com.br` e `ARKO_NODE_TOKEN=…` (mais `ARKO_REGISTRY_USER`/`ARKO_REGISTRY_TOKEN` se a imagem do ArkoBot no GHCR for privada). `docker compose up -d`. Em até 15 s o servidor aparece **online** no painel.
6. **Admin (Vercel)**: nada obrigatório. Opcionais: `INSTANCES_BASE_DOMAIN`, `INSTANCE_IMAGE` (fixe por digest para controlar as atualizações) e `AI_GATEWAY_PUBLIC_URL`.

**Recursos por instância na VPS**: o teto é o `ram_mb` do plano (Inicial 1 GB, Essencial 2 GB, Profissional 4 GB, Empresa 8 GB) e 0,5/1/2/4 CPUs. Uma instância sem bot trabalhando fica em torno de 300–500 MB (servidor + Caddy); com um bot trabalhando (Claude Code/Codex + Chrome) chega perto do teto. Disco: a imagem é compartilhada (alguns GB, uma vez só); cada volume começa com poucos MB e cresce com o uso. O `disk_gb` do plano é um limite **medido**, não imposto pelo disco (o driver `local` do Docker não tem cota e o disco da VPS é compartilhado): veja "Limite de espaço" abaixo.

### Limite de espaço

- O agente mede o volume `/data` de cada instância (`GET /system/df?type=volume`, só os volumes com as etiquetas do ArkoBot deste nó) no máximo a cada 10 min e manda o número no relatório de sempre (`src/node-agent/disk.ts`). Uma medição lenta não segura o relatório; uma que falha repete a última.
- O Admin compara com o `disk_gb` do plano (GB binários) e guarda em `instances.disk_*` (migração `0010`): `ok` abaixo de 80%, `warning` a partir de 80%, `full` a partir de 100%, `over` a partir de 110% (`src/provisioning/storage.ts`).
- E-mail ao dono da conta uma vez ao passar de 80% e uma vez ao chegar a 100% (`disk_notified_percent`); só volta a avisar depois que o uso cai abaixo de 70%.
- A instância recebe o estado por `POST /api/cloud/storage` assinado (job `instance.sync_storage`). Em `over` ela recusa uploads novos (anexos e arquivos no chat) com "Seu espaço acabou: apague arquivos ou mude de plano"; a partir de `full` mostra uma faixa. Ler, apagar e conversar nunca são bloqueados e nada é apagado.
- O cartão "Meu ArkoBot" mostra "X GB de Y GB usados" com barra e aviso a partir de 80%; o painel mostra o uso na coluna **Disco** de Instâncias.

### Dormir quando ociosa (Inicial)

Um plano com `plans.idle_sleep_minutes` (o Inicial: 30, migração `0011`) dorme quando fica esse tempo sem uso e acorda quando alguém o usa (`src/provisioning/sleep.ts`).

- **Quem decide se está ociosa é a instância** (`server/cloud-power.ts`): nenhum bot respondendo, nenhuma rotina rodando ou para começar, nenhuma tarefa entre bots, chamada ao vivo, computador ligado ou manutenção, ninguém usando há 30 min, acordada há pelo menos 2 min, próxima rotina a mais de 5 min — e, a pedido do Admin (`browsers=1`), **nenhuma página aberta** (o stream de eventos de uma aba conta). Uma imagem antiga, sem essa contagem, nunca dorme.
- **O Admin pergunta** no máximo uma vez por minuto por instância (`GET /api/cloud/power?idleMinutes=30&browsers=1`, assinado), a cada relatório do agente (15 s) e no cron. Ociosa → `POST /api/cloud/power/sleep {"v":1,"idleMinutes":30,"browsers":true}`; com o "sim" grava `instances.sleeping_since` e `wake_at` (a próxima rotina menos 3 min). O motivo de ficar acordada fica em `power_busy` (Instâncias mostra).
- **Dormir = contêiner parado** pelo agente no próximo ciclo (estado desejado `stopped`, com `sleeping: true`); o volume fica e `instances.state` não muda, então cobrança e operador não veem parada nenhuma. Parada por pagamento ou pelo operador manda mais que o sono. Na Área do cliente aparece **Dormindo**; no painel, um selo **Dormindo** com quando acorda.
- **Acorda** (auditoria `instance.woke`, com `via`): **Abrir meu ArkoBot** (o cartão mostra **Acordando…**, espera a instância responder e abre já logado); **visita direta** a `https://<slug>.arkobot.com.br` (a página de despertar do agente, abaixo); **a próxima rotina** (`wake_at`, conferido a cada consulta do agente e no cron); e se o plano deixar de dormir. Ao acordar, o Admin manda um pedido ao endereço da instância (`x-arkobot-wake: 1`): a página de despertar o recebe e o agente consulta o Admin na hora, em vez de esperar os 15 s; enquanto o contêiner liga, o agente consulta a cada 3 s. Um contêiner parado volta em ~20 s.
- **Página de despertar** (`src/node-agent/wake-server.ts`, porta 8790 do agente, `ARKO_WAKE_PORT`): o compose do agente tem um roteador do Traefik de **prioridade 1** (`HostRegexp` de qualquer `<slug>.arkobot.com.br`, `websecure`, `letsencrypt`) que só pega o que nenhuma instância atende — como a de uma instância que dorme, cujo roteador some junto com o contêiner. Para uma instância que dorme: 503 com "Seu ArkoBot está acordando…", recarrega sozinha a cada 3 s e pede ao Admin para acordá-la (`POST /api/agent/v1/wake`, no máximo a cada 10 s por instância). Parada por pagamento/operador: "Este ArkoBot está pausado". Endereço desconhecido: 404. O certificado de cada `<slug>` continua no `acme.json` do Traefik e é servido pelo SNI.
- **Webhooks** que chegam com a instância dormindo recebem 503 (e a acordam); WhatsApp e Telegram repetem a entrega.

### Avisos de operação

`src/provisioning/health-alerts.ts`, no cron (`/api/cron/tick`; precisa rodar a cada 5 min — Vercel Pro ou um cron na VPS):

- **Servidor sem contato**: um nó `active` cujo agente não fala com o Admin há mais de **5 min** → e-mail uma vez (`nodes.down_alerted_at`) e outro quando ele volta. Um nó posto em *Esvaziando*/*Desligado* não gera aviso.
- **Instância com erro**: vista em `error` pelo agente, ou com o health check falhando, por mais de **10 min** (`instances.unhealthy_since`) → e-mail uma vez (`unhealthy_alerted_at`) e outro quando volta ao normal. Só para instâncias num servidor que responde.
- Destinatários: `ADMIN_ALERT_EMAIL` ou os donos ativos. A página **Instâncias** mostra uma faixa vermelha enquanto durar.

### Backups e mudança de servidor

`src/backups` (Admin) e `src/node-agent/tasks.ts` (agente 0.4.0+). Liga com as variáveis `BACKUP_S3_*` (qualquer armazenamento compatível com S3: Contabo Object Storage, Backblaze B2, Cloudflare R2, MinIO); sem elas nada muda.

- **Diário**: o cron agenda um backup por instância que já subiu, quando o último tem mais de 22 h. O agente **congela** o contêiner (`docker pause`, para os arquivos SQLite ficarem coerentes), um ajudante `arkotask-pack-<id>` (a imagem do próprio agente, sem rede) empacota o volume num volume de passagem (`arkobot-backup-staging`), o contêiner **descongela** e outro ajudante `arkotask-up-<id>` envia o arquivo em partes de 64 MB direto ao armazenamento. O Admin só assina os endereços de cada parte (SigV4, válidos por 1 h); os dados nunca passam pela Vercel e as chaves do armazenamento nunca vão para os servidores. Uma instância dormindo é copiada parada, sem congelar.
- **Retenção**: os últimos `BACKUP_KEEP_DAILY` diários (padrão 7) por instância; manuais por 30 dias; os de mudança por 7. Um backup que não termina em 6 h é dado como falho (e o envio em partes é abortado).
- **Painel** (Instâncias): coluna **Backup** (o último), **Backups** (lista, **Fazer backup agora**, **Baixar** só para o dono) e **Mudar de servidor**.
- **Mudar de servidor** (com os dados): a instância para, um backup "mudança" roda no servidor de origem, o servidor de destino restaura antes de existir contêiner ali (`arkotask-restore-<id>`) e então a instância liga lá (geração +1); o servidor antigo remove o contêiner e **mantém o volume**. Se o backup ou a restauração falhar, a mudança é cancelada e a instância volta a ligar onde estava. Leva alguns minutos.
- **VPS própria do cliente**: com backups ligados, a mudança de uma instância com dados para a VPS dela (Computadores, "dados a copiar") acontece **sozinha** pelo cron, do mesmo jeito.
- **Agentes antigos** (< 0.4.0) ignoram as tarefas: os backups deles ficam "na fila" e falham em 6 h. Atualize os agentes antes de ligar os backups.

### Ainda não feito

- Cota de disco imposta pelo sistema de arquivos (hoje é medida e só recusa uploads novos), troca de plano aplicada sem reprovisionar à mão (o limite de bots já muda no próximo "Abrir"), equipes (`role=team`), e apagar o volume de uma instância desativada (hoje só à mão: `docker volume rm arkoinst-<id>-data`).
- Dormir: o app desktop ainda não pede ao Admin para acordar a instância (o `POST /api/cloud/desktop/wake` do `docs/cloud-pro.md` é do Admin antigo); se o Admin estiver fora do ar, a página de despertar não consegue acordar ninguém (só mostra "acordando" e tenta de novo).

## Computadores próprios (VPS)

O que o OpenMausBot vendia como "computador extra (VPS)": R$ 159/mês cada, em qualquer plano; o Profissional inclui 1 e o Empresa 2. Aqui, cada unidade vira uma VPS comprada pelo Admin num provedor, com o mesmo agente do nó. **O primeiro computador de cada cliente recebe o ArkoBot dele** (nó `dedicated`, instância no modo `dedicated`, com a VPS só para ele). As unidades seguintes ficam registradas e no ar como nós do cliente, à espera de serem ligadas aos bots (próxima parte), por isso nunca são compradas sem aprovação.

```
Asaas (pagamento confirmado) ─► Admin: direito do cliente ─► pedido (vps_machines) ─► [Aprovar e contratar] ─► provedor (Hetzner/Hostinger/Contabo)
                                                                                                                   │ cria a VPS com o script de 1ª inicialização
VPS do cliente ── POST /api/agent/v1/enroll (token de inscrição) ─► token do nó ─► Traefik + agente do nó ─► instância do cliente
Navegador ─► *.arkobot.com.br (VPS compartilhada, Traefik) ─► contêiner arkoedge-<slug> (TCP, TLS sem abrir) ─► VPS do cliente :443
```

- **Direito** (`src/computers/entitlement.ts`): unidades = `plans.included_vps` + quantidade do adicional `computador-adicional`. **Comprar** só depois de dinheiro: nada durante o teste grátis; unidades do adicional só quando um pagamento confirmado já as cobriu (o valor pago menos o do plano dividido por R$ 159). **Manter** é mais folgado: atraso e suspensão mantêm as máquinas; só o fim da assinatura as libera. A cortesia dá só as incluídas.
- **Quando**: cada pagamento confirmado, cada mudança de assinatura e de adicional enfileira `computer.sync`; o cron (`/api/cron/tick`) também varre e dá o próximo passo nas compras em andamento.
- **Compra automática** (Computadores → Configurações, só o dono): **desligada por padrão**. Desligada, cada unidade vira um pedido "Aguardando aprovação" e o operador clica **Aprovar e contratar** (com o custo na confirmação). Ligada, só o computador do ArkoBot é comprado sozinho.
- **A compra sai uma vez**: a troca `requested → ordering` é condicional; uma resposta incerta do provedor (sem resposta, erro 5xx) vira falha "[compra incerta]" que **nunca** é repetida sozinha: confira no painel do provedor e descarte ou resolva à mão. Uma recusa clara (ex.: cartão recusado) pode ser tentada de novo.
- **Instalação** (`src/computers/post-install.ts`): o mesmo script nos três provedores (post-install script na Hostinger; `user_data`/cloud-init na Hetzner e na Contabo). Instala Docker se faltar, as chaves SSH do operador, troca o **token de inscrição** (uso curto, só o hash no banco, aceito só do IP da VPS) pelo token do nó, sobe o Traefik (`traefik:v3.6.2`, certificado Let's Encrypt por TLS-ALPN) e o agente (`node-agent.vps.compose.yml`), e fecha a porta 443 para tudo que não seja a VPS compartilhada (regra na cadeia `DOCKER-USER`, porque portas do Docker passam por fora do ufw). O token do nó nunca fica no provedor.
- **Pronto**: quando o agente da VPS manda o primeiro relatório, a máquina fica "No ar" e a instância do cliente vai para lá: **cliente novo** (instância que nunca subiu) muda sozinho; **cliente com dados** fica com "dados a copiar" até o operador copiar o volume e clicar **Mover ArkoBot** (abaixo). Na mudança, o servidor antigo remove o contêiner (o volume fica lá) e a VPS compartilhada passa o endereço adiante.
- **DNS**: nada muda. O curinga `*.arkobot.com.br` continua apontando para a VPS compartilhada (o DNS da HostGator não tem API); o agente dela cria um contêiner `arkoedge-<slug>` (a própria imagem do agente, `relay.mjs`) com um roteador TCP do Traefik `HostSNI(<slug>.arkobot.com.br)` e `tls.passthrough`: o TLS só abre na VPS do cliente. Atualize o agente da VPS compartilhada para a versão 0.3.0 antes do primeiro cliente dedicado.
- **Dormir numa VPS do cliente**: o roteador TCP da borda vale para o endereço esteja a instância acordada ou não (os roteadores TCP `HostSNI` passam na frente do catch-all HTTP da página de despertar da VPS compartilhada). Na VPS do cliente, o compose do agente gerado pelo script de instalação tem o mesmo roteador de despertar (prioridade 1, porta 8790) que `node-agent.vps.compose.yml` (um teste mantém os dois iguais), então a página "acordando…" aparece lá, e o agente de lá pede ao Admin para acordá-la com o token do próprio nó. A regra padrão é `*.arkobot.com.br`; com outro domínio, defina `ARKO_WAKE_RULE` no `.env` do agente.
- **Encerrar** (só o dono, com motivo; recusado enquanto o ArkoBot do cliente roda na VPS — mova ou desative a instância antes): Hostinger desliga a renovação (a VPS e os dados somem no fim do período pago); Contabo cancela no fim do período; **Hetzner apaga a VPS na hora, com o disco** (a cobrança é por hora). O cliente deixa de pagar pelo Asaas quando o adicional é reduzido ou a assinatura acaba; a máquina fica "Encerrar no provedor" até o operador agir: nenhum dado é apagado sem ação explícita.
- **Área do cliente**: o cartão **Meus computadores** mostra cada computador (preparando, pronto, encerrando), sem IP nem provedor; **Alterar** muda a quantidade do adicional (o novo valor vale na próxima cobrança, e a compra espera esse pagamento).

### Provedores

| Provedor | Padrão | Cobrança | Observações |
| --- | --- | --- | --- |
| **Hetzner Cloud** (padrão) | `cx23` (2 vCPU, 4 GB, 40 GB) em `fsn1` | por hora, com teto mensal; apagar para a cobrança | Melhor custo-benefício (≈ € 3,49 + IPv4). `cx23` só existe na Europa; para ficar mais perto do Brasil use `ash` com `cpx21` (mais caro). Ajuste o custo em reais nas configurações. |
| **Hostinger** | `hostingercombr-vps-kvm1-brl-1m` (KVM 1: 1 vCPU, 4 GB, 50 GB) | mensal, R$ 87,99 (1º mês R$ 52,99) | Compra pela API de VPS (`POST /api/vps/v1/virtual-machines` com `setup`); 202 = pagamento em processamento, a máquina é achada pela assinatura depois. Modelo "Ubuntu 24.04 with Docker" e data center no Brasil escolhidos sozinhos. |
| **Contabo** | `V91` em `US-east` | mensal, mas os preços baixos pedem 12/24 meses; alguns produtos cobram instalação | Pode levar horas para instalar (o Admin espera até 72 h). Preço e taxa não vêm pela API: informe nas configurações. **Não serve para revenda mensal.** |

### Colocar no ar

1. Migração `0012_computadores_vps.sql` (`pnpm --filter admin migrate`; só acrescenta).
2. Variáveis na Vercel: `HETZNER_API_TOKEN` (ou as da Hostinger/Contabo), `VPS_SSH_PUBLIC_KEYS`, e `NODE_REGISTRY_USER`/`NODE_REGISTRY_TOKEN` se as imagens forem privadas.
3. Publique a imagem nova do agente (`ghcr.io/otaviobmarques/arkobot-node-agent`, com `relay.mjs`) e atualize o agente da VPS compartilhada; confira que o nó compartilhado tem o IP público cadastrado (é o único IP que a VPS do cliente aceita na 443).
4. Admin → **Computadores → Configurações**: provedor, tipo/local e custo. Deixe a compra automática desligada nas primeiras vendas.

### Mover uma instância com dados

Com os backups ligados (`BACKUP_S3_*`, seção "Backups e mudança de servidor"), isso é automático: o cron muda a instância com os dados. Sem eles, à mão: com a VPS do cliente "No ar" e a instância marcada "dados a copiar", pare a instância (Instâncias → Parar), copie o volume e clique **Mover ArkoBot**:

```bash
# na VPS compartilhada (troque <id> e o IP da VPS do cliente; a chave do operador já está nela)
docker run --rm -v arkoinst-<id>-data:/data alpine tar -C /data -czf - . \
  | ssh root@<ip-do-cliente> 'docker volume create arkoinst-<id>-data >/dev/null && docker run --rm -i -v arkoinst-<id>-data:/data alpine tar -C /data -xzf -'
```

Depois de mover, ligue a instância de novo. O volume antigo fica na VPS compartilhada até alguém apagá-lo à mão.

### Custo e margem

Por unidade, R$ 159/mês de receita contra cerca de R$ 26 (Hetzner `cx23`, ajuste ao câmbio) ou R$ 87,99 (Hostinger KVM 1). As unidades incluídas no Profissional e no Empresa são custo dentro do preço do plano. O painel mostra o custo mensal somado das máquinas em uso ao lado da receita de referência.

## Próximas partes

- **Instâncias**: backup dos volumes (veja [Provisionamento automático](#provisionamento-automático-instâncias-dos-clientes)).
- **Gateway**: e-mail dos avisos de 50/80/100% (`UsageAlertNotifier`), preços por faixa de contexto longo.
- **Computadores (VPS)**: os computadores extras ligados aos bots (o backend "VPS própria" do app, por SSH), cópia automática do volume ao mudar de servidor, e PROXY protocol na borda (hoje a instância vê o IP da VPS compartilhada).
- Troca de plano com pró-rata (também na Área do cliente), emissão de NFS-e quando a conta PJ estiver ativa, convites de membros para a organização.
