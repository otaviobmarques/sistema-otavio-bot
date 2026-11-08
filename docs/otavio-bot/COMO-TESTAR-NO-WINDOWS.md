# Como testar o Otávio Bot no seu PC com Windows

Este é o teste que prova a Fase 1: dois ou três bots respondendo pelas suas assinaturas do Claude e do ChatGPT.

Por enquanto, os textos dentro do app ainda dizem "OpenMausBot" e "MausBot". O rebrand completo vem numa etapa própria.

## Antes de começar

Instale e faça login no terminal do Windows (PowerShell) em pelo menos um destes:

- **Claude Code** (usa a sua assinatura do Claude): siga https://claude.com/claude-code e rode `claude` uma vez para entrar na sua conta.
- **Codex** (usa a sua assinatura do ChatGPT): siga https://github.com/openai/codex e rode `codex` uma vez para entrar na sua conta.

O app encontra os dois sozinho, se estiverem instalados e logados.

## 1. Baixar o instalador

1. Abra https://github.com/otaviobmarques/sistema-otavio-bot/actions/workflows/package-win.yml
2. Clique em **Run workflow**, deixe a branch `main` e confirme.
3. Espere uns 20 a 30 minutos, até a rodada ficar verde.
4. Abra a rodada e, em **Artifacts**, baixe **windows-installer**.
5. Descompacte o arquivo baixado.

Cada rodada gasta uns 60 dos 2.000 minutos grátis por mês do GitHub, porque minuto de Windows conta em dobro.

## 2. Instalar

1. Rode o arquivo `...-setup.exe`. Não precisa de administrador.
2. O Windows vai mostrar "O Windows protegeu o computador", porque o instalador ainda não tem assinatura digital. Clique em **Mais informações** e depois em **Executar assim mesmo**.

## 3. O teste

1. Abra o app. Na primeira tela, ele mostra quais assistentes encontrou (Claude, Codex).
2. Crie três bots, por exemplo:
   - **Téo**, Franquias, com Claude
   - **Bia**, SDR, com ChatGPT (Codex)
   - **Duda**, Copy, com Claude
3. Mande uma mensagem para cada um, uma logo depois da outra, sem esperar a resposta. Por exemplo: "Escreva três ideias de post sobre franquias".
4. Confira se os três respondem ao mesmo tempo.
5. Crie uma rotina para um deles, por exemplo "todo dia às 18h, me mande um resumo", e confira se ela aparece agendada.

## O que me mandar depois

- Se funcionou: um print de cada bot respondendo.
- Se não funcionou: um print da tela de erro e em qual passo parou.

Com isso eu sei se a base está provada ou o que precisa ser corrigido antes de seguir para as empresas, o prédio e o WhatsApp.
