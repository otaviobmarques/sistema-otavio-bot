# Otávio Bot 24 horas no VPS

Este guia coloca o servidor do Otávio Bot para rodar o tempo todo no seu VPS
(Hostinger KVM 2, Ubuntu 24.04, IP `200.141.20.53`), com endereço próprio e
HTTPS. Depois disso, o app do PC e o celular viram "janelas" para o servidor:
os bots, as conversas e as rotinas ficam no VPS e continuam rodando com o PC
desligado.

O que vai acontecer, em resumo:

1. Um endereço (ex.: `bots.seudominio.com.br`) aponta para o VPS.
2. O VPS roda dois contêineres: o servidor do Otávio Bot e o Caddy (que cuida
   do HTTPS).
3. Os desktops dos bots continuam sendo contêineres no mesmo VPS, como hoje.
4. Um backup é feito todo dia de madrugada.

Os contêineres dos outros projetos (autovisao, ecv-cash, OpenClaw) **não são
mexidos**. O passo 2 mostra como conferir se eles estão usando as portas 80 e
443, e o que fazer nesse caso.

Cada comando está num bloco separado: copie um bloco, cole no terminal do VPS,
aperte Enter e espere terminar antes do próximo.

---

## 0. Antes de começar (uma vez, no GitHub)

A imagem do servidor é publicada pelo GitHub em
`ghcr.io/otaviobmarques/sistema-otavio-bot`.

1. No GitHub, rode **Actions → Publicar versão** (como você já faz para lançar
   o instalador do Windows). Além do instalador, isso agora publica a imagem
   do servidor com o número da versão e com a etiqueta `latest`.
   - Cada push no `main` também publica a imagem com a etiqueta `main`. Se
     quiser testar antes de publicar uma versão, use `OTAVIO_BOT_VERSION=main`
     no passo 3.
2. Depois da primeira publicação, deixe o pacote público, para o VPS baixar sem
   senha (o repositório já é público e o pacote não tem nenhum segredo):
   - abra <https://github.com/otaviobmarques?tab=packages>;
   - clique em **sistema-otavio-bot**;
   - à direita, **Package settings**;
   - lá embaixo, em **Danger Zone**, **Change visibility → Public** e confirme.

   Prefere deixar privado? Então crie no GitHub um token (Settings → Developer
   settings → Personal access tokens → Tokens (classic)) só com a permissão
   `read:packages`, e no VPS rode uma vez o comando abaixo (ele pede o token
   como senha; o token não vai para nenhum arquivo do projeto):

   ```sh
   docker login ghcr.io -u otaviobmarques
   ```

   (O GitHub também publica `sistema-otavio-bot-cloud-home`, uma variante que
   este VPS não usa. Pode ignorar.)

---

## 1. DNS: o endereço apontando para o VPS

No painel onde você comprou o domínio (Registro.br, Hostinger, Cloudflare...),
crie um registro:

| Tipo | Nome | Valor | TTL |
|---|---|---|---|
| A | `bots` | `200.141.20.53` | 300 (ou o menor disponível) |

O "Nome" `bots` vira `bots.seudominio.com.br`. Se o painel for a Cloudflare,
deixe a nuvem **cinza** ("DNS only"), senão o certificado não é emitido.

Confira (pode levar alguns minutos). No VPS ou no PC:

```sh
getent hosts bots.seudominio.com.br
```

Tem que aparecer `200.141.20.53`.

No painel da Hostinger, em **VPS → Firewall**, se houver regras ativas,
libere as portas **80** e **443** (TCP) de qualquer origem, além da 22 que já
está liberada.

---

## 2. Conferir as portas 80 e 443

Entre no VPS como root (`ssh root@200.141.20.53`) e rode:

```sh
ss -ltnp '( sport = :80 or sport = :443 )'
```

```sh
docker ps --format '{{.Names}}  {{.Ports}}' | grep -E ':(80|443)->' || echo "nenhum contêiner nas portas 80/443"
```

- **Nada apareceu nos dois comandos** (só a linha de títulos no primeiro):
  as portas estão livres. Siga o **caminho A** (mais simples).
- **Apareceu alguma coisa** (ex.: `traefik`, `nginx`, `caddy`, um contêiner do
  OpenClaw): outro proxy já usa as portas. **Não pare esse contêiner.** Siga o
  **caminho B**. Quando você apagar os projetos antigos, dá para passar para o
  caminho A (veja o fim do passo 3).

---

## 3. Instalar e subir o servidor

Baixe só os arquivos de instalação para `/opt/otavio-bot`:

```sh
git clone --depth 1 https://github.com/otaviobmarques/sistema-otavio-bot /opt/otavio-bot
```

```sh
cd /opt/otavio-bot/deploy && cp .env.example .env
```

Abra o arquivo de configuração:

```sh
nano /opt/otavio-bot/deploy/.env
```

Troque `DOMAIN=bots.seudominio.com.br` pelo seu endereço real. Salve com
`Ctrl+O`, `Enter`, e saia com `Ctrl+X`.

### Caminho A: as portas 80/443 estão livres

Não precisa mudar mais nada no `.env`. Baixe a imagem e suba:

```sh
cd /opt/otavio-bot/deploy && docker compose pull && docker compose up -d
```

O Caddy pede o certificado HTTPS sozinho (leva até 1 minuto na primeira vez).

### Caminho B: outro proxy já usa as portas 80/443

No `.env`, tire o `#` do começo da linha:

```
COMPOSE_FILE=docker-compose.yml:docker-compose.atras-de-proxy.yml
```

Assim o Otávio Bot não ocupa as portas 80/443; ele fica só em
`http://127.0.0.1:18080`, visível apenas dentro do VPS. Suba:

```sh
cd /opt/otavio-bot/deploy && docker compose pull && docker compose up -d
```

Agora o proxy que já existe precisa encaminhar o seu endereço para ele. Ele
tem que repassar o `Host` original, mandar `X-Forwarded-Proto: https` e não
segurar ("bufferizar") as respostas, senão as conversas não atualizam ao vivo.

- **Se o proxy é um nginx instalado no próprio VPS** (o `ss` do passo 2
  mostrou `nginx`, sem ser contêiner), crie
  `/etc/nginx/sites-available/otavio-bot` com:

  ```nginx
  server {
      listen 80;
      server_name bots.seudominio.com.br;
      location / {
          proxy_pass http://127.0.0.1:18080;
          proxy_http_version 1.1;
          proxy_set_header Host $host;
          proxy_set_header X-Forwarded-For $remote_addr;
          proxy_set_header X-Forwarded-Proto $scheme;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection "upgrade";
          proxy_buffering off;
          proxy_read_timeout 1h;
      }
  }
  ```

  Ative e peça o certificado (o `certbot` troca o `listen 80` por HTTPS e
  ajusta o `X-Forwarded-Proto`):

  ```sh
  ln -s /etc/nginx/sites-available/otavio-bot /etc/nginx/sites-enabled/ && nginx -t && systemctl reload nginx
  ```

  ```sh
  apt install -y certbot python3-certbot-nginx && certbot --nginx -d bots.seudominio.com.br
  ```

- **Se o proxy é um contêiner** (Traefik, nginx-proxy, Caddy de outro
  projeto): um contêiner não enxerga o `127.0.0.1` do VPS. No `.env`, tire o
  `#` também de `OTAVIO_PROXY_BIND=172.17.0.1`, rode de novo o
  `docker compose up -d` acima, e configure nesse proxy um site
  `bots.seudominio.com.br` que encaminha para `http://172.17.0.1:18080`
  (no Traefik: um "service" com essa URL no provedor de arquivo). Como cada
  projeto configura o seu proxy de um jeito, veja onde ficam os sites dele
  (`docker inspect NOME-DO-CONTÊINER` mostra as pastas montadas).

**Mais tarde, quando os projetos antigos forem apagados** e as portas 80/443
ficarem livres: coloque de volta o `#` em `COMPOSE_FILE=` (e em
`OTAVIO_PROXY_BIND=`, se usou), apague o site que criou no outro proxy e rode
`docker compose up -d`. Os dados continuam os mesmos.

### Conferir

```sh
cd /opt/otavio-bot/deploy && docker compose ps
```

O serviço `omb` deve aparecer como `healthy`. Depois abra no navegador do PC
`https://bots.seudominio.com.br`: aparece a tela de pareamento ("pair"). Isso
é o esperado: ninguém entra sem um código.

Se algo der errado, os registros ficam em:

```sh
cd /opt/otavio-bot/deploy && docker compose logs --tail 50
```

---

## 4. Parear o app do PC e o celular

Cada aparelho entra uma vez com um código de uso único (vale 10 minutos).

### Gerar um código (no VPS)

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb openmausbot pair --label "PC do Otávio"
```

Ele mostra um código (ex.: `ABCD-EFGH-JKLM`) e um link
`https://bots.seudominio.com.br/pair#code=...`, além de um QR code.

### App do PC: abrir no servidor do VPS

1. Copie o link inteiro mostrado no terminal.
2. No app Otávio Bot do PC, abra **Configurações** (engrenagem) →
   **Computador** → seção **Servidores** → botão **Conectar a um servidor**.
   (Outro jeito: com o link copiado, menu **Servidor** → **Adicionar servidor
   pelo link de pareamento copiado…**.)
3. Cole o link em **Link ou endereço**. O app procura o servidor e mostra
   algo como `✓ bots.seudominio.com.br · MausBot 0.2.0`.
4. Clique em **Conectar a bots.seudominio.com.br**. A janela abre o servidor do
   VPS, já pareado.

Daqui em diante:

- **Ao abrir o app, ele volta sozinho para o último servidor escolhido.** O
  app guarda qual servidor estava aberto (`activeId` no arquivo de ambientes
  dele) e, na próxima vez, a janela abre direto no VPS. Não precisa
  configurar nada.
- Para trocar entre o VPS e o PC: o seletor no topo da barra lateral, ou o
  menu **Servidor** → **Este computador** / `bots.seudominio.com.br`. Em
  **Configurações → Computador → Servidores**, a lista **Seus servidores** tem
  o botão **Trocar**.
- Se o VPS estiver fora do ar quando o app abrir, ele avisa e mostra o
  servidor do PC; escolha o VPS de novo no menu **Servidor** quando ele voltar.

**E o servidor que roda no PC?** Ele continua existindo e **continua ligando
junto com o app**, em segundo plano, mesmo com a janela mostrando o VPS. Hoje
não há opção para não iniciá-lo (o app usa esse servidor local para as funções
do próprio PC). Na prática:

- ele gasta pouco enquanto não tem bots trabalhando;
- os bots e conversas antigos do PC continuam lá, intactos; nada é apagado;
- se algum bot do PC tiver rotina agendada, ela continua rodando no PC
  enquanto o app estiver aberto. Para "rodar tudo no VPS", pause essas
  rotinas no PC (menu **Servidor → Este computador**, depois nas rotinas do
  bot), e crie os bots de novo no VPS.

### Celular

Gere outro código no VPS. Com `--phone`, o celular pode conversar, aprovar e
ler, mas não muda configurações (tire o `--phone` se quiser acesso total):

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb openmausbot pair --phone --label "Celular"
```

No celular, abra o link mostrado (ou leia o QR code com a câmera). O navegador
fica pareado; no menu do navegador use **Adicionar à tela inicial** para virar
um ícone de app.

Com o PC já pareado, também dá para fazer pelo app, sem terminal:
**Configurações → Computador → Acesso remoto → Parear um celular ou outro
computador**, que mostra um QR code.

---

## 5. Login do Claude e do ChatGPT no servidor

Os bots usam as suas assinaturas pelas ferramentas oficiais (Claude Code e
Codex), que já vêm dentro da imagem. O login é feito **uma vez, no servidor**,
e fica guardado no volume de dados (sobrevive a reinícios e atualizações).

### Pelo app (recomendado, sem terminal)

Com a janela no servidor do VPS: **Configurações → IA → Provedores de
modelos**.

- **Claude:** clique em **Entrar no Claude**. Abre a página de login da
  Anthropic no navegador do seu PC; entre com a sua conta, copie o código que
  ela mostra e cole de volta no app. O servidor entrega esse código ao Claude
  Code e não o guarda.
- **ChatGPT (Codex):** clique em **Conectar o ChatGPT**. O app mostra um
  código de uso único; clique para abrir a página da OpenAI, digite o código e
  confirme. Se a OpenAI recusar, ative "login por código de dispositivo" nas
  configurações de segurança da sua conta ChatGPT e tente de novo.

Depois, a mesma tela mostra a conta conectada. O app confere o login com os
próprios comandos das ferramentas (`claude auth status --json` e
`codex login status`), rodando no servidor.

### Pelo terminal do VPS (alternativa)

Funciona sem navegador no VPS: as ferramentas mostram um link ou código para
abrir no navegador do PC ou do celular.

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb claude auth login
```

Abra o link que aparecer, entre, copie o código mostrado e cole no terminal.

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb codex login --device-auth
```

Abra o endereço mostrado, digite o código e confirme.

Conferir:

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb claude auth status
```

```sh
cd /opt/otavio-bot/deploy && docker compose exec omb codex login status
```

---

## 6. Desktops dos bots no mesmo VPS

Hoje o app do PC cria os desktops dos bots no VPS usando
`docker -H ssh://otaviobot-vps` com o usuário `otaviobot` (veja
[byo-vps.md](../byo-vps.md)). Com o servidor rodando no próprio VPS, ele faz
**exatamente a mesma coisa**, só que de dentro do contêiner: entra por SSH no
próprio VPS (pela rede interna do Docker, sem sair para a internet) como
`otaviobot` e fala com o Docker dele. Nada novo fica exposto: nenhuma porta é
aberta, os desktops continuam sem portas publicadas e a tela ao vivo passa pelo
túnel SSH, como antes.

Um script faz toda a ligação: cria uma chave SSH só do servidor (guardada no
volume de dados), autoriza essa chave para o `otaviobot` **apenas a partir da
rede do Otávio Bot**, grava a identidade do VPS (sem "confiar no primeiro
acesso") e testa.

```sh
cd /opt/otavio-bot/deploy && ./ligar-desktops.sh
```

No fim deve aparecer `Docker do VPS: 29...` e `Pronto`. Então, no app (janela
no VPS):

1. **Configurações → IA → Chaves de API → VPS próprio** (ou digite `vps` na
   busca das Configurações), escreva `otaviobot-vps` e clique em **Salvar**.
2. Em cada bot que deve ter desktop: nas configurações do bot, seção
   **Acesso**, escolha o computador **Nuvem** e, em **Backend de nuvem**,
   **VPS próprio** (como você já faz hoje no PC).

O primeiro desktop demora alguns minutos (a imagem do desktop é montada no
VPS na primeira vez).

Se o script disser que não conseguiu entrar por SSH: o firewall do Ubuntu pode
estar bloqueando conexões vindas dos contêineres. Veja com `ufw status`; se
estiver ativo, libere a rede que o script mostrou em "aceita de" (exemplo):

```sh
ufw allow from 172.18.0.0/16 to any port 22 proto tcp
```

**Os desktops antigos, criados pelo app do PC**, continuam no VPS e o servidor
novo não mexe neles (cada instalação só usa os próprios). Quando não precisar
mais deles, apague pelo app do PC: menu **Servidor → Este computador**,
**Configurações → Computador → Desktops dos bots → Computadores em VPS
próprio**.

**Atenção à segurança (vale hoje também, no PC):** quem fala com o Docker do
VPS manda no VPS inteiro. Um bot com acesso ao terminal do servidor consegue
ler essa chave, do mesmo jeito que hoje consegue ler a do seu PC. Por isso
use o VPS para os bots e evite guardar nele coisas que você não confiaria a
eles; quando apagar os projetos antigos, melhor ainda.

**Memória:** o servidor tem limite de 3 GB (`OTAVIO_MEM_LIMIT` no `.env`), e
cada desktop de bot pode usar até 4 GB. Num VPS de 8 GB, junto com os outros
projetos, deixe **um desktop ligado por vez** (os outros dormem sozinhos ou
pelo botão **Dormir** no painel do computador do bot). Ter uma área de troca
ajuda a não travar num pico; para criar 4 GB de swap (uma vez):

```sh
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## 7. Backups

O que importa (bots, conversas, rotinas, aparelhos pareados e os logins do
Claude e do ChatGPT) fica num único volume do Docker, `otavio-bot_data`.

### Backup diário automático

Instale uma vez:

```sh
cd /opt/otavio-bot/deploy && ./instalar-backup-diario.sh
```

Todo dia, por volta das 4h15, o `backup.sh` grava
`/var/backups/otavio-bot/otavio-bot-AAAA-MM-DD-HHMM.tar.gz` e apaga os que
passaram de 14 dias (mude `BACKUP_KEEP_DAYS` no `.env`). Durante a cópia o
servidor fica pausado por alguns segundos (não é desligado): assim a cópia é
de um instante só, e os bots continuam depois.

Fazer um backup agora, na mão:

```sh
cd /opt/otavio-bot/deploy && ./backup.sh
```

Ver os backups:

```sh
ls -lh /var/backups/otavio-bot/
```

Os arquivos de backup têm os logins das suas assinaturas: só o root do VPS
consegue ler, e guarde as cópias de fora com o mesmo cuidado.

### Copiar os backups para fora do VPS

Um backup só no VPS não protege se o VPS sumir. No **PC** (PowerShell do
Windows ou terminal), copie a pasta inteira de vez em quando:

```sh
scp -r root@200.141.20.53:/var/backups/otavio-bot ./backups-otavio-bot
```

(Com `rsync` instalado, `rsync -av root@200.141.20.53:/var/backups/otavio-bot/ ./backups-otavio-bot/`
copia só o que é novo.) Outra opção é ativar os **backups semanais da
própria Hostinger** no painel do VPS, que guardam o disco inteiro.

O app também tem a seção **Configurações → Backups** (busque "backup"), que
gera um arquivo com senha pelo navegador. Ela é manual; o backup diário acima
é o automático.

### Restaurar um backup

Isto troca todos os dados atuais pelos do backup escolhido. Antes, o script
guarda o estado atual como mais um backup, então dá para voltar atrás.

```sh
cd /opt/otavio-bot/deploy && ./restaurar-backup.sh /var/backups/otavio-bot/otavio-bot-AAAA-MM-DD-HHMM.tar.gz
```

Ele pede para digitar `SIM`.

---

## 8. Atualizar para uma versão nova

Quando você roda **Publicar versão** no GitHub, a imagem nova sai com o mesmo
número do instalador do Windows e como `latest`. No VPS:

```sh
cd /opt/otavio-bot/deploy && docker compose pull && docker compose up -d
```

Os dados ficam. Atualizar o arquivo de instalação (compose, scripts) também,
de vez em quando:

```sh
cd /opt/otavio-bot && git pull
```

Para ficar numa versão fixa (ou voltar para a anterior se a nova der
problema), coloque o número no `.env`, por exemplo `OTAVIO_BOT_VERSION=0.2.0`,
e rode de novo o `docker compose pull && docker compose up -d`.

---

## 9. Como desfazer

Parar o Otávio Bot no VPS (os dados ficam guardados no volume):

```sh
cd /opt/otavio-bot/deploy && docker compose down
```

Desligar o backup diário:

```sh
systemctl disable --now otavio-bot-backup.timer
```

Tirar o acesso do servidor ao Docker do VPS: apague a linha que termina em
`otavio-bot-servidor` no arquivo abaixo.

```sh
nano /home/otaviobot/.ssh/authorized_keys
```

Apagar **tudo**, inclusive bots, conversas e logins (faça um backup antes e
copie para fora; não tem volta):

```sh
cd /opt/otavio-bot/deploy && docker compose down -v
```

No PC, o app volta a ser como antes: menu **Servidor → Este computador**; em
**Configurações → Computador → Servidores**, remova o servidor do VPS da
lista. Os bots do PC estão onde sempre estiveram. Por fim, apague o registro
A `bots` no DNS, se não for mais usar.

---

## Para quem mantém o projeto

- Arquivos: [`deploy/docker-compose.yml`](../../deploy/docker-compose.yml)
  (caminho A), [`deploy/docker-compose.atras-de-proxy.yml`](../../deploy/docker-compose.atras-de-proxy.yml)
  e [`deploy/Caddyfile.atras-de-proxy`](../../deploy/Caddyfile.atras-de-proxy)
  (caminho B), [`deploy/ligar-desktops.sh`](../../deploy/ligar-desktops.sh),
  [`deploy/backup.sh`](../../deploy/backup.sh),
  [`deploy/restaurar-backup.sh`](../../deploy/restaurar-backup.sh),
  [`deploy/instalar-backup-diario.sh`](../../deploy/instalar-backup-diario.sh).
- A imagem (`Dockerfile`, alvo `server`) traz o cliente Docker (com buildx) e
  o cliente SSH, porque o backend "VPS próprio" só fala
  `docker -H ssh://<apelido>` e abre o túnel da tela por SSH. Montar o
  `/var/run/docker.sock` no contêiner daria o mesmo poder sobre o VPS e
  exigiria mudar o backend; o SSH para o próprio host reaproveita o caminho já
  usado no PC, sem mudança de código.
- `.github/workflows/docker.yml` testa a imagem a cada mudança e publica:
  `main` e `sha-…` a cada push no `main`; a versão e `latest` quando
  `publish-release.yml` ("Publicar versão") a chama.
