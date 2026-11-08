# Otávio Bot · Portal (protótipo)

Protótipo navegável do **Portal web** do Otávio Bot: o prédio com uma empresa por andar, o chat com Destaques, o computador de cada bot, empresas e organograma, a sala do conselho, a contratação de bots, extensões, o HUD de voz do Tavinho e as figurinhas.

Tudo aqui usa **dados fictícios**. Não há IA de verdade nem backend: as respostas dos bots são de exemplo e o estado (aprovações, auditoria, contratações) vive só na memória do navegador. Recarregar a página volta tudo ao início.

## Como rodar

Precisa de Node 24 e pnpm 10 (via corepack). Na raiz do repositório:

```bash
pnpm install
pnpm --filter @otaviobot/portal dev        # http://localhost:5180
```

Outros comandos:

```bash
pnpm --filter @otaviobot/portal typecheck  # TypeScript estrito
pnpm --filter @otaviobot/portal build      # gera apps/portal/dist
pnpm --filter @otaviobot/portal preview    # serve o build em http://localhost:5181
```

## Telas

| Rota                 | Tela                                                         |
| -------------------- | ------------------------------------------------------------ |
| `/`                  | Prédio (painel): andares, salas, térreo, feed e gasto do mês |
| `/ao-vivo`           | Prédio ao vivo: escritório animado, elevador, 1x/2x/4x       |
| `/chat`, `/chat/:id` | Chat com Destaques, cartão de aprovação e computador ao lado |
| `/computador/:botId` | Computador do bot: tela ao vivo, terminal, logins, políticas |
| `/empresas/:id`      | Empresa e organograma, orçamento por bot, regras, heartbeats |
| `/conselho`          | Sala do conselho: aprovações, bloqueios, auditoria, resumo   |
| `/contratar`         | Contratar bot: identidade, IA e modelo, figurinha, acessos   |
| `/extensoes`         | Skills, servidores MCP, apps conectados, políticas, chaves   |
| `/tavinho`           | HUD de voz do Tavinho                                        |
| `/figurinhas`        | As doze figurinhas originais e os tamanhos 24, 36 e 48 px    |

Abaixo de 640 px de largura o Portal troca para o layout de celular, com abas embaixo (Prédio, Chat, Conselho, Tavinho).

## O que dá para fazer

- Aprovar, ajustar ou recusar pedidos no conselho ou no próprio chat: o cartão sai e a auditoria ganha uma linha.
- Assumir o controle do computador do Otávio, travado no 2FA do Canva, e devolver ao bot.
- Contratar um bot: a figurinha muda enquanto você edita, o bot espera na recepção e só sobe para a sala depois que você aprova no conselho.
- Clicar num bot no prédio para abrir o chat ou o computador dele; abrir uma conversa limpa o badge dos Destaques.
- Instalar uma skill do GitHub (simulado) e escolher quais bots recebem.

## Organização

- `src/data/mock.ts`: todos os dados fictícios, tipados (empresas, bots, aprovações, auditoria, conversas, skills, MCP, apps).
- `src/state/store.tsx`: contexto React com o estado e as ações do protótipo.
- `src/components/Figurinha.tsx`: figurinhas geradas em SVG a partir de cabeça, olhos, boca, cor e acessório.
- `src/pages/`: uma tela por rota.
- `docs/screenshots/`: capturas das telas em 1440×900 e no celular.

As figurinhas são personagens originais do Otávio Bot, desenhados em código; o protótipo não usa nenhum asset do OpenMausBot.
