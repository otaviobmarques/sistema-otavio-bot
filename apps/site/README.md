# Site do ArkoBot (arkobot.com.br)

Site de vendas do ArkoBot, em Next.js (App Router, exportação estática), Tailwind, Motion e Remotion Player.

```bash
pnpm install                      # na raiz do repositório
pnpm --filter @arkobot/site dev   # http://localhost:3000
pnpm --filter @arkobot/site build # gera apps/site/out
```

`scripts/preparar.mjs` roda antes do `dev` e do `build`: gera favicon e ícones a partir de `docs/arkobot/mark.svg` e copia os logos das integrações para `public/gerado/` (fora do git), em duas versões: escura para o fundo branco e branca para os mockups escuros. A imagem de compartilhamento `public/og.png` fica no repositório; para refazê-la, rode `pnpm --filter @arkobot/site og` numa máquina com a fonte Inter instalada.

## O que editar antes de publicar

| Arquivo | O quê |
| --- | --- |
| `src/config/contato.ts` | Link de assinatura (`urlAssinatura`), WhatsApp e/ou e-mail. Vazios, "Começar agora" e "Falar com um especialista" levam à seção de contato, que diz que os canais saem em breve. |
| `src/config/planos.ts` | Planos, preços, créditos, computador adicional, créditos avulsos, a tabela "Comparar todos os recursos", a linha que explica os créditos e a garantia de 7 dias. `precosDefinidos = false` esconde os valores. |
| `src/config/integracoes.json` | IAs da faixa de logos e do seletor de modelo (conferidas em `server/drivers/`; `soConta` marca as que só entram pela conta do cliente) e os apps (Composio e WhatsApp), com o arquivo de logo de cada um. |
| `src/config/trabalhos.ts` | As abas de "Dê a cada bot um trabalho": descrição, horário, apps e a mini-conversa de cada uma. |
| `conteudo/legal/*.md` | Termos de Uso, Política de Privacidade e Política de Cookies, publicados em `/termos/`, `/privacidade/` e `/cookies/` (o Markdown vira HTML no build). Vieram de `docs/legal/` do branch `legal-arkobot`, já com os dados da empresa. O e-mail de contato e o encarregado ainda não foram informados: os textos usam o WhatsApp como canal provisório, e cada ponto a trocar tem um comentário `<!-- TROCAR: ... -->`, que não aparece no site. |
| `src/config/equipe.ts` | Os bots de exemplo (nome, função, cores e acessório do avatar) usados no site todo. |
| `src/config/site.ts` | Título, descrição, endereço e menu. |

## Logos das integrações

Os logos não ficam no repositório: o `preparar.mjs` os copia dos pacotes abaixo (dependências de desenvolvimento) e pinta os monocromáticos de branco.

- IAs (OpenAI, Claude, Gemini, Grok, Kimi, DeepSeek, NVIDIA, Mistral, Meta, Qwen, MiniMax, OpenRouter, Groq, Cerebras, Copilot, Cursor): [`@lobehub/icons-static-svg`](https://github.com/lobehub/lobe-icons) 1.102.0, licença MIT.
- Apps (WhatsApp, Gmail, Google Agenda, Google Drive, Notion, HubSpot, GitHub, Linear): [`simple-icons`](https://simpleicons.org) 16.37.0, licença CC0-1.0.

As marcas continuam dos seus donos; o site as usa só para dizer com o que o ArkoBot integra, com essa nota na seção e no rodapé. A licença do pacote cobre o desenho em SVG, não a marca: se algum fabricante pedir para tirar, apague a linha dele em `integracoes.json`.

## Publicar na Vercel

1. Na Vercel, **Add New → Project** e importe o repositório do GitHub.
2. Em **Root Directory**, escolha `apps/site`. Deixe ligada a opção de incluir arquivos fora do Root Directory (é o padrão): o build lê `docs/arkobot/` e `public/abertura/` da raiz.
3. **Framework Preset**: Next.js. Os comandos vêm do `vercel.json` (`pnpm build`); a Vercel instala as dependências pelo `pnpm-lock.yaml` da raiz. Em **Node.js Version**, use 24.
4. **Deploy**.
5. Em **Settings → Domains**, adicione `arkobot.com.br` e `www.arkobot.com.br` (redirecionando o `www` para o domínio sem `www`).
6. No Registro.br (ou onde o domínio estiver), crie os registros DNS que a Vercel mostrar: normalmente um `A` para `arkobot.com.br` apontando para `76.76.21.21` e um `CNAME` de `www` para `cname.vercel-dns.com`. O certificado HTTPS sai sozinho.

Para não gastar builds a cada mudança no app, em **Settings → Git → Ignored Build Step** use `git diff --quiet HEAD^ HEAD -- . ../../docs/arkobot ../../public/abertura`.

## Licença do Remotion

O `@remotion/player` é gratuito para pessoas físicas e empresas com até 3 funcionários; acima disso, a Remotion exige uma licença de empresa (remotion.pro). Em novembro de 2026 a Domma Tecnologia tem 1 pessoa, então a licença gratuita se aplica. Se a equipe passar de 3 pessoas, contrate a licença de empresa.
