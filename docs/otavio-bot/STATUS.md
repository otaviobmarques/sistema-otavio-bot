# Status da Fase 1

Plano completo: [`Otavio_Bot_-_Descritivo_Tecnico.pdf`](Otavio_Bot_-_Descritivo_Tecnico.pdf).

Critério de pronto da Fase 1: três bots trabalhando em paralelo num projeto seu, pelo app desktop, com uma rotina agendada rodando.

## O que a base (OpenMausBot) já entrega

| Item da Fase 1 | Situação | Onde está |
| --- | --- | --- |
| Elenco de bots com persona e memória | Pronto na base | `server/bot-*.ts`, `docs/memory.md` |
| Drivers Claude Code e Codex pelos CLIs logados | Pronto na base | `server/drivers/`, `server/claude-*.ts`, `server/codex-*.ts` |
| Cartões de aprovação inline | Pronto na base | `src/components/ApprovalCard.tsx`, `docs/approval-levels.md` |
| Salas com modo Auto (decisor escolhe quem responde) | Pronto na base | `server/decider/`, `docs/decision-model.md` |
| Rotinas agendadas | Pronto na base | `server/routine-schedules.ts`, `docs/routine-schedules.md` |
| Webhooks | Pronto na base | `server/webhooks.ts`, `server/webhook-ingress.ts` |
| Criação de bot com nome, função e modelo | Pronto na base | `src/components/NewBotDialog.tsx` |
| Não lidas | Pronto na base (aviso de não lidas) | `src/components/unread-notice.ts` |
| Interface em português | Pronto na base (pt-BR) | `src/locales/pt-br.json` |

## O que já foi feito neste fork

- Pasta `enterprise/` removida. Ela tem licença própria e exige chave em produção. O app compila e passa no typecheck sem ela.
- Rebrand dos textos de interface para "Otávio Bot" nas 16 línguas (388 textos), com o catálogo validado.
- Nome do produto, ID do app, nomes dos instaladores, atalho, textos de permissão do macOS e canal de atualização apontando para o repositório público `otaviobmarques/otavio-bot-releases`, que guarda só os instaladores.
- Tema escuro padrão trocado para o visual do Otávio Bot: azul-marinho com o azul do Tavinho e a fonte Inter. Contraste conferido com `pnpm check:contrast`.
- Analytics desligada. A chave do PostHog dos autores originais foi removida. A analytics só funciona se você configurar uma chave própria em `VITE_POSTHOG_TOKEN`.
- Portal web com as telas do protótipo em `apps/portal/`, com dados de exemplo.

## O que falta para fechar a Fase 1

1. **Figurinhas próprias no app.** O app ainda usa o mascote do OpenMausBot como avatar padrão, e esse mascote é marca registrada. É preciso trocar pelas figurinhas do Otávio Bot (o Portal já tem as figurinhas desenhadas).
2. **Seção Destaques.** Falta levar para o topo da lista as conversas em que o bot falou com você, com badge verde, âmbar ou vermelho.
3. **Criação de bot pelo conselho.** Hoje o bot nasce na hora. Pelo plano, ele precisa passar por aprovação do conselho antes.
4. **Relatórios de bug.** O botão de enviar relatório manda para `cloud.openmausbot.com`, ou seja, para a equipe original. O certo é desligar ou apontar para um endereço seu.
5. **Recursos de nuvem do OpenMausBot** (MausBot Cloud, Boat, login hospedado). Eles continuam no código e apontam para os serviços originais. É preciso esconder ou remover.
6. **Nomes internos.** Pacotes, variáveis `OMB_*`, esquema `openmausbot://`, caminhos de Linux e nomes de helpers do macOS continuam com o nome antigo. Não aparecem para o usuário. Dá para trocar depois, com cuidado, porque mexem em dados salvos.
7. **Teste no Windows.** Gerar o instalador `.exe` e validar o critério de pronto no seu PC. Exige Windows e, para não cair no aviso do SmartScreen, um certificado de assinatura.

## Decisões pendentes (do plano)

- Nome final: Otávio Bot ou Tavinho. Marca: Domma ou pessoal.
- WhatsApp por QR Code (rápido, com risco de banimento) ou pela API oficial (estável, paga).
- Onde ficam os computadores dos bots na Fase 2: só no Docker do seu PC ou já num VPS.
- Produto interno ou SaaS da Domma desde o começo.
- Confirmar nos termos atuais da Anthropic e da OpenAI o uso automatizado das assinaturas pelos CLIs.
