# Site do ArkoBot (arkobot.com.br)

Site de vendas do ArkoBot, em Next.js (App Router, exportação estática), Tailwind, Motion e Remotion Player.

```bash
pnpm install                      # na raiz do repositório
pnpm --filter @arkobot/site dev   # http://localhost:3000
pnpm --filter @arkobot/site build # gera apps/site/out
```

`scripts/preparar.mjs` roda antes do `dev` e do `build`: copia o símbolo de `docs/arkobot/mark.svg` (favicon e ícones), recorta as telas reais de `docs/arkobot/screenshots/` e copia o vídeo de abertura de `public/abertura/` para `public/gerado/` (fora do git). A imagem de compartilhamento `public/og.png` fica no repositório; para refazê-la, rode `pnpm --filter @arkobot/site og` numa máquina com a fonte Inter instalada.

## O que editar antes de publicar

| Arquivo | O quê |
| --- | --- |
| `src/config/contato.ts` | WhatsApp e/ou e-mail dos botões "Começar" e "Falar com a gente". Vazios, os botões levam à seção de contato, que diz que os canais saem em breve. |
| `src/config/planos.ts` | Os 3 planos e o computador adicional. Com `precosDefinidos = false` (padrão) o site mostra "Em breve" e "Fale com a gente"; os valores do arquivo são só exemplos. |
| `src/config/ias.ts` | IAs listadas (conferidas em `server/drivers/`). |
| `src/config/site.ts` | Título, descrição e endereço usados no SEO. |

## Publicar na Vercel

1. Na Vercel, **Add New → Project** e importe o repositório do GitHub.
2. Em **Root Directory**, escolha `apps/site`. Deixe ligada a opção de incluir arquivos fora do Root Directory (é o padrão): o build lê `docs/arkobot/` e `public/abertura/` da raiz.
3. **Framework Preset**: Next.js. Os comandos vêm do `vercel.json` (`pnpm build`); a Vercel instala as dependências pelo `pnpm-lock.yaml` da raiz. Em **Node.js Version**, use 24.
4. **Deploy**.
5. Em **Settings → Domains**, adicione `arkobot.com.br` e `www.arkobot.com.br` (redirecionando o `www` para o domínio sem `www`).
6. No Registro.br (ou onde o domínio estiver), crie os registros DNS que a Vercel mostrar: normalmente um `A` para `arkobot.com.br` apontando para `76.76.21.21` e um `CNAME` de `www` para `cname.vercel-dns.com`. O certificado HTTPS sai sozinho.

Para não gastar builds a cada mudança no app, em **Settings → Git → Ignored Build Step** use `git diff --quiet HEAD^ HEAD -- . ../../docs/arkobot ../../public/abertura`.

## Licença do Remotion

O `@remotion/player` é gratuito para pessoas físicas e empresas com até 3 funcionários. Acima disso, a Remotion exige uma licença de empresa (remotion.pro). Confira antes de publicar.
