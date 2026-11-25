# Política de Cookies do ArkoBot

**Versão 1.0, em vigor a partir de 25/11/2026**

Esta Política explica quais cookies e tecnologias semelhantes o site arkobot.com.br e o app do ArkoBot usam, para quê e como você pode controlá-los. Ela segue a LGPD, o Marco Civil da Internet e o **Guia Orientativo sobre Cookies e Proteção de Dados Pessoais da ANPD** (2022), e complementa a [Política de Privacidade](politica-de-privacidade.md) e os [Termos de Uso](termos-de-uso.md).

**Responsável:** Domma Tecnologia e Desenvolvimento de Softwares Ltda ("Domma"), CNPJ 70.075.405/0001-74, Av. Paulista, 1636, Conj. 5, Pav. 11, Bela Vista, São Paulo/SP. **Encarregado:** Otávio Bruno Marques, pelo e-mail [contato@arkobot.com.br](mailto:contato@arkobot.com.br).

## Resumo em linguagem simples

- **Hoje, o ArkoBot usa apenas cookies e armazenamento necessários** para você entrar na conta e para lembrar as suas preferências no app.
- **Não usamos cookies de publicidade nem de rastreamento entre sites.**
- **Não usamos, hoje, ferramentas de análise de uso** com cookies. Se passarmos a usar, você verá um aviso para **aceitar ou recusar**, e nada será ativado antes da sua escolha.

## Sumário

1. [O que são cookies e tecnologias semelhantes](#1-o-que-são-cookies-e-tecnologias-semelhantes)
2. [Categorias de cookies](#2-categorias-de-cookies)
3. [Cookies e armazenamento que usamos hoje](#3-cookies-e-armazenamento-que-usamos-hoje)
4. [Análise de uso e marketing](#4-análise-de-uso-e-marketing)
5. [Cookies de terceiros](#5-cookies-de-terceiros)
6. [O navegador dos bots](#6-o-navegador-dos-bots)
7. [Bases legais e consentimento](#7-bases-legais-e-consentimento)
8. [Como gerenciar cookies](#8-como-gerenciar-cookies)
9. [Alterações desta Política](#9-alterações-desta-política)

---

## 1. O que são cookies e tecnologias semelhantes

1.1. **Cookies** são pequenos arquivos de texto que um site grava no seu navegador para reconhecer o aparelho, manter você conectado ou lembrar escolhas.

1.2. **Tecnologias semelhantes** cumprem funções parecidas, como o **armazenamento local do navegador** (*localStorage*, *sessionStorage* e *IndexedDB*) e o armazenamento do app desktop. Nesta Política, chamamos tudo isso de "cookies".

1.3. Os cookies podem ser:

- **próprios**, quando gravados pelo domínio que você visita (arkobot.com.br ou o endereço do seu app), ou **de terceiros**, quando gravados por outro domínio;
- **de sessão**, que somem quando você fecha o navegador, ou **persistentes**, que ficam por um prazo definido ou até você apagá-los.

## 2. Categorias de cookies

Seguindo o Guia da ANPD, classificamos os cookies em:

| Categoria | Para que serve | Precisa do seu consentimento? | Usamos hoje? |
| --- | --- | --- | --- |
| **Estritamente necessários** | Permitir o funcionamento básico e a segurança: login, sessão, proteção contra fraude, e guardar a sua escolha sobre cookies | Não. São indispensáveis ao serviço que você pediu | **Sim** |
| **Funcionalidade (preferências)** | Lembrar escolhas que você fez no app, como idioma, tema, tamanho de painéis e rascunhos | Não, quando servem apenas para entregar a funcionalidade que você pediu e ficam só no seu aparelho | **Sim** |
| **Análise e desempenho** | Medir como o produto é usado para melhorá-lo | **Sim** | **Não** |
| **Publicidade e marketing** | Mostrar anúncios e acompanhar você entre sites | **Sim** | **Não** |

## 3. Cookies e armazenamento que usamos hoje

### 3.1. No site arkobot.com.br

Na data desta Política, **o site não grava cookies de análise, de publicidade ou de terceiros**. A hospedagem (Vercel) registra dados técnicos de acesso (como IP, navegador, página, data e hora) para entregar as páginas e proteger o site contra abusos. Esses registros ficam nos servidores, não no seu navegador, e estão descritos na Política de Privacidade.

Se o site passar a usar alguma ferramenta de medição de audiência, ela será listada aqui antes de ser ativada, e as que usarem cookies ou identificadores no seu aparelho dependerão do seu consentimento (seção 4).

### 3.2. No app do ArkoBot (navegador, desktop e celular)

**Cookie estritamente necessário:**

| Nome | Tipo | Finalidade | Duração |
| --- | --- | --- | --- |
| `omb_session_<porta>_<identificador>` | Próprio, persistente, protegido (HttpOnly, Secure, SameSite=Lax) | Manter você conectado depois de parear o aparelho ou entrar por e-mail, e identificar a sua sessão em cada pedido ao servidor. Sem ele, você não consegue usar o app | **30 dias**, renovados com o uso, até o máximo de **180 dias**; é apagado ao sair da conta ou desconectar o aparelho |

O cookie de sessão guarda apenas um código aleatório, sem nome, e-mail ou outros dados seus legíveis. O `<porta>` e o `<identificador>` identificam a instalação do servidor.

**Armazenamento local (localStorage) do app**, gravado e lido apenas no seu aparelho, sem envio a terceiros:

| Grupo | Exemplos de chaves | Finalidade | Categoria | Duração |
| --- | --- | --- | --- | --- |
| Preferências de interface | `omb-language`, `omb-font`, `omb-skin`, `omb-chat-width`, `omb-computer-panel-width`, `omb-color-user-bubbles`, `omb-send-key`, `omb-advanced-mode`, `omb-show-threads`, `omb-web-panels` | Lembrar idioma, aparência, tamanhos de painéis e atalhos que você escolheu | Funcionalidade | Até você apagar ou mudar a preferência |
| Notificações | `omb-notification-sounds`, `omb-notification-feed`, `omb-notification-tray-pinned`, `omb-finished-notifications` | Lembrar como você quer ser avisado e quais avisos já viu | Funcionalidade | Até você apagar |
| Rascunhos | `omb-drafts`, `omb-draft-attachments`, `omb-draft-channel-modes` | Não perder o que você estava digitando ao trocar de tela ou recarregar | Funcionalidade | Até a mensagem ser enviada ou você apagar |
| Primeiros passos e avisos | `omb.onboarding.*`, `omb.launch.*`, `omb.cloudWelcome.done`, `omb-installed`, `omb-engine-updated-seen` | Não repetir telas de boas-vindas e avisos já vistos | Funcionalidade | Até você apagar |
| Organização | `…:bot-order`, `omb-building-mode`, `omb-follow-up` | Lembrar a ordem dos bots e a forma de visualização | Funcionalidade | Até você apagar |
| Segurança e funcionamento | `omb.session-ended`, `omb-webhook-credentials`, `omb-email-gate` | Avisar que a sessão terminou e guardar temporariamente dados técnicos exibidos durante uma configuração | Estritamente necessário | Curta duração ou até a tarefa terminar |
| Escolha sobre análise de uso | `omb-analytics-opt-out` | Guardar a sua decisão de **não** permitir análise de uso | Estritamente necessário | Até você mudar a escolha |

Os nomes começam com `omb` por razões técnicas (o ArkoBot é baseado no projeto de código aberto OpenMausBot). A lista pode ganhar ou perder chaves com a evolução do app, mas sempre dentro das finalidades e categorias acima. Se surgir uma categoria nova, esta Política será atualizada antes.

O app desktop guarda essas mesmas preferências na pasta de dados do aplicativo no seu computador.

## 4. Análise de uso e marketing

4.1. **Hoje, nenhuma ferramenta de análise ou de marketing está ativa** no site ou no app do ArkoBot.

4.2. O app tem suporte técnico a uma ferramenta de análise de uso de produto (PostHog), **desligada** nas versões distribuídas pela Domma. Se a Domma decidir ativá-la no futuro:

- a) ela só começará a funcionar **depois que você aceitar** no aviso de cookies ou nas configurações do app;
- b) os eventos coletados serão anônimos ou pseudonimizados, **sem** nomes, e-mails, conteúdo de conversas, instruções, nomes de bots, endereços de sites ou credenciais;
- c) esta Política e a Política de Privacidade serão atualizadas antes, com o nome da ferramenta, os dados coletados, o país de processamento e o prazo dos cookies; e
- d) você poderá retirar o consentimento a qualquer momento, com a mesma facilidade com que o deu.

4.3. **Aviso de cookies (banner).** Quando houver cookies que dependam de consentimento, o site e o app mostrarão, na primeira visita, um aviso com:

- botões **"Aceitar"** e **"Recusar"** com o mesmo destaque, sem caixas pré-marcadas;
- opção de **escolher por categoria**;
- link para esta Política; e
- um link permanente **"Preferências de cookies"** no rodapé do site e nas configurações do app para mudar a escolha.

Recusar não impede o uso do site ou do app. Guardaremos o registro da sua escolha para comprovar o consentimento e perguntaremos de novo se as finalidades mudarem ou depois de **12 meses**.

## 5. Cookies de terceiros

5.1. Quando você usa serviços de terceiros a partir do ArkoBot, esses serviços podem gravar os próprios cookies, segundo as políticas deles:

- **Pagamento:** ao pagar pela página do **Asaas**, ele pode usar cookies para segurança e prevenção a fraude;
- **Login em serviços conectados:** ao autorizar um aplicativo conectado (por exemplo, Google ou Microsoft), você é levado à página desse serviço, que usa os próprios cookies.

5.2. A Domma não controla esses cookies. Consulte as políticas de cada serviço.

## 6. O navegador dos bots

O navegador que os bots usam no computador do bot guarda cookies e sessões dos sites que eles visitam e em que você os autorizou a entrar. Esses cookies **ficam no computador do bot, não no seu aparelho**, fazem parte do Conteúdo do Cliente e são tratados conforme os Termos de Uso e a Política de Privacidade. Você pode apagar as sessões salvas de um site nas configurações do navegador do bot.

## 7. Bases legais e consentimento

7.1. **Cookies estritamente necessários e de funcionalidade** solicitada por você são usados com base na **execução do contrato** (art. 7º, V, da LGPD) e no **legítimo interesse** de manter o serviço seguro e funcionando (art. 7º, IX), porque sem eles o serviço que você pediu não funciona.

7.2. **Cookies de análise e de marketing**, quando existirem, dependerão do seu **consentimento** (art. 7º, I), livre, informado e inequívoco, que pode ser retirado a qualquer momento.

## 8. Como gerenciar cookies

8.1. **No ArkoBot:** em **Configurações** do app você controla as preferências e, quando houver, a análise de uso. Para apagar o cookie de sessão, saia da conta ou desconecte o aparelho na lista de aparelhos pareados.

8.2. **No navegador:** você pode ver, bloquear e apagar cookies e dados de sites nas configurações do seu navegador. Veja as instruções do [Chrome](https://support.google.com/chrome/answer/95647), do [Firefox](https://support.mozilla.org/pt-BR/kb/limpe-cookies-e-dados-de-sites-no-firefox), do [Safari](https://support.apple.com/pt-br/guide/safari/sfri11471/mac) e do [Edge](https://support.microsoft.com/pt-br/microsoft-edge). Atenção: se bloquear os cookies estritamente necessários, não será possível entrar no app.

8.3. Apagar o armazenamento local do navegador volta as preferências ao padrão e pode apagar rascunhos não enviados.

8.4. Dúvidas ou pedidos sobre cookies: e-mail [contato@arkobot.com.br](mailto:contato@arkobot.com.br) ou [WhatsApp +55 (19) 98782-2290](https://wa.me/5519987822290).

## 9. Alterações desta Política

Podemos atualizar esta Política, por exemplo, ao adotar uma nova ferramenta. A data da versão vigente fica no topo. Antes de ativar cookies que dependam de consentimento, atualizaremos esta Política e pediremos a sua autorização.
