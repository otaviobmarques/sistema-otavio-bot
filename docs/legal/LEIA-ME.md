# Documentos legais do ArkoBot: o que falta antes de publicar

Esta pasta tem a versão final de três documentos do ArkoBot:

| Arquivo | O que é |
| --- | --- |
| [`termos-de-uso.md`](termos-de-uso.md) | Termos de Uso, com o **Anexo I: Acordo de Tratamento de Dados Pessoais** (DPA resumido, para quando a Domma é operadora) |
| [`politica-de-privacidade.md`](politica-de-privacidade.md) | Política de Privacidade, com o **Anexo de suboperadores** |
| [`politica-de-cookies.md`](politica-de-cookies.md) | Política de Cookies, com a lista do que o app grava hoje |

Os três se citam entre si. Se mudar um prazo ou uma regra num deles, confira os outros (a seção "Onde cada prazo aparece", no fim, ajuda).

## 1. Dados a preencher

Troque cada marcador pelo dado real em **todos** os arquivos (um "localizar e substituir" resolve). Não publique com nenhum `{{` sobrando.

| Marcador | O que colocar | Onde aparece |
| --- | --- | --- |
| `{{RAZAO_SOCIAL}}` | Razão social completa da Domma Tecnologia, como está no CNPJ | Termos, Privacidade, Cookies |
| `{{CNPJ}}` | CNPJ no formato 00.000.000/0000-00 | Termos, Privacidade, Cookies |
| `{{ENDERECO}}` | Endereço completo da sede (rua, número, complemento, bairro, cidade, UF, CEP). O Decreto 7.962/2013 exige endereço físico | Termos, Privacidade, Cookies |
| `{{EMAIL_CONTATO}}` | E-mail de atendimento, cancelamento e arrependimento (ex.: contato@arkobot.com.br). Precisa ser respondido em até 5 dias | Termos, Privacidade |
| `{{EMAIL_ENCARREGADO}}` | E-mail do encarregado de dados (ex.: privacidade@arkobot.com.br) | Termos, Privacidade, Cookies |
| `{{NOME_ENCARREGADO}}` | Nome da pessoa (ou empresa) nomeada encarregada | Termos, Privacidade, Cookies |
| `{{CIDADE_FORO}}` | Comarca do foro para clientes empresariais (em geral, a cidade da sede) | Termos |
| `{{DATA_VIGENCIA}}` | Data em que os documentos começam a valer (dd/mm/aaaa) | Topo dos três |
| `{{LOCAL_SERVIDORES}}` | País (e cidade, se quiser) do data center da Hostinger onde fica o VPS do ArkoBot. Confira no hPanel em VPS → Visão geral. Se for fora do Brasil, a seção 9 da Privacidade já cobre a transferência | Privacidade (seção 9 e Anexo) |

Para conferir se sobrou algum:

```sh
grep -n "{{" docs/legal/*.md
```

## 2. Decisões que você precisa confirmar

Os textos já trazem uma proposta para cada ponto abaixo. Se discordar, mude nos lugares indicados.

1. **Validade dos Créditos.** Proposta: créditos comprados avulsos valem **12 meses**; créditos da franquia do plano valem até o fim do período (Termos 5.5). Créditos com validade são aceitos no mercado, mas a expiração pode ser questionada por consumidores no Procon e na Justiça. Prazos curtos aumentam esse risco.
2. **Reembolso de Créditos.** Proposta: não reembolsáveis, salvo arrependimento, falha do serviço, encerramento pela Domma sem culpa do cliente, descontinuação do produto e cancelamento por discordar de mudança de preço ou dos Termos (Termos 8.6). Cláusula de "nunca reembolsa" seria abusiva para consumidor (art. 51 do CDC); por isso as exceções.
3. **Arrependimento de 7 dias com reembolso integral.** Para consumidor, a lei manda devolver **tudo** o que foi pago, sem descontar o que já foi usado (art. 49 do CDC). Os Termos fazem isso (8.3). Para empresas, a proposta é uma cortesia de 7 dias na primeira contratação, descontando os créditos consumidos (8.4). Se não quiser oferecer isso a empresas, apague o item 8.4.
4. **Plano gratuito.** Proposta: limites mudam com 30 dias de aviso; contas sem acesso por **12 meses** podem ser encerradas com aviso de 30 dias (Termos 5.2).
5. **Inadimplência.** Proposta: multa de 2% (teto do CDC para consumidor), juros de 1% ao mês, suspensão após **10 dias** do aviso, encerramento após **60 dias** (Termos 7). VPS adicional em atraso por mais de 30 dias é desligado e apagado 15 dias depois (Termos 12.6).
6. **Reajuste.** Proposta: planos recorrentes reajustados uma vez por ano pelo IPCA; outras mudanças de preço, inclusive na tabela de consumo, com **30 dias** de aviso (Termos 6.5).
7. **Prazos de exclusão.** Proposta: 30 dias para exportar depois do encerramento da conta e mais 30 para apagar; backups somem no ciclo de **14 dias** (o `deploy/backup.sh` guarda 14 dias hoje, variável `BACKUP_KEEP_DAYS`). Se mudar a retenção dos backups, atualize a Privacidade (seção 10).
8. **Aviso de incidente ao cliente (DPA).** Proposta: em até **48 horas** (Termos, Anexo I, I.5). Confirme que a equipe consegue cumprir.
9. **Marketing por e-mail.** A Privacidade prevê envio de novidades só com consentimento. Se não for mandar, pode tirar a linha da tabela da seção 5.
10. **Suporte.** Os Termos dizem dias úteis, horário comercial, resposta em até 5 dias (17.4). Ajuste se for diferente.
11. **Provedores de IA e de recursos opcionais.** A lista de suboperadores tem Hostinger, Vercel, Asaas, Anthropic, OpenAI, Google e OpenRouter. O código do app também sabe usar ElevenLabs, Fish Audio e Groq (voz e transcrição), xAI, Mistral, DeepSeek e outros, Composio (apps conectados) e Postiz. **Se a Domma ativar qualquer um deles na conta dela para os clientes, inclua-o no Anexo da Privacidade antes.** O mesmo vale para o provedor de e-mail transacional (o serviço que manda e-mails de login e cobrança) e para ferramentas de atendimento.
12. **Encarregado.** Mesmo que a Domma se enquadre como agente de pequeno porte (Resolução CD/ANPD nº 2/2022), a dispensa de encarregado não vale para quem faz tratamento de alto risco, e o uso de IA em larga escala pode ser visto assim. Recomendação: manter o encarregado nomeado (Resolução CD/ANPD nº 18/2024) e divulgar o nome e o e-mail no site.

## 3. O que precisa estar pronto no produto antes de publicar

Os textos descrevem o ArkoBot como SaaS. Algumas coisas que eles prometem ainda não existem no código deste repositório. Publique os documentos só depois que estiverem prontas, ou ajuste o texto.

1. **Guarda de registros de acesso por 6 meses (Marco Civil, art. 15).** Hoje o Caddy (`deploy/Caddyfile`) e o Traefik não guardam log de acesso com IP, data e hora, e o servidor não tem essa função. É obrigação legal para a Domma (empresa com fins econômicos): ligue o log de acesso no proxy, com fuso horário, guardado com acesso restrito por pelo menos 6 meses e apagado depois.
2. **Planos, créditos e Asaas.** A cobrança pelo Asaas, o saldo de créditos, a tabela de consumo, os alertas de vencimento e os limites do plano gratuito ainda não estão no código (o Asaas aparece só nos dados de exemplo do Portal). A página de planos e o resumo antes da contratação (Decreto 7.962/2013, art. 4º) precisam existir.
3. **Botão de cancelamento e arrependimento no app.** O Decreto 7.962/2013 exige que o arrependimento possa ser feito pelo mesmo meio da contratação, com confirmação imediata. Crie esse botão na área de conta e o e-mail automático de confirmação.
4. **Registro do aceite.** Guarde a versão dos Termos aceita, data, hora e IP de cada aceite (Termos 21.2).
5. **Exportação e exclusão da conta.** Os textos prometem exportar dados e excluir a conta pelo app. Confira se o fluxo existe para o cliente do SaaS (hoje há backup e exportação de espaço de trabalho, pensados para quem hospeda o próprio servidor).
6. **OpenRouter sem treinamento.** A Privacidade diz que o roteamento do OpenRouter não usa provedores que retêm dados para treinamento. Ative isso na conta da Domma no OpenRouter (configuração de privacidade/"data policy") e confira se Anthropic, OpenAI e Google estão em contas de API comerciais com o não treinamento padrão.
7. **Cláusulas-padrão da ANPD.** A Resolução CD/ANPD nº 19/2024 exige que transferências baseadas em cláusulas contratuais usem as cláusulas-padrão da ANPD (prazo de adequação encerrado em agosto de 2025). Provedores grandes dos EUA raramente assinam cláusulas brasileiras. Para os dados de que a Domma é controladora, o texto usa como base a execução do contrato (art. 33, IX, LGPD); para o conteúdo dos bots, a instrução do cliente. Peça ao advogado para validar essa estrutura e verifique se algum provedor oferece adendo compatível.
8. **Análise de uso desligada.** A Política de Cookies diz que não há análise ativa. Garanta que a versão publicada **não** tenha `VITE_POSTHOG_TOKEN`. Atenção: se um dia ligar, o código atual liga a análise **por padrão** (o usuário precisa desligar). Para seguir o Guia da ANPD e o texto da Política, mude para só ativar depois do "Aceitar".
9. **Site arkobot.com.br.** O código do site não está neste repositório. Confirme que ele não usa Google Analytics, pixel da Meta, Google Tag Manager, Hotjar, chat de terceiros ou fontes que gravem cookies. Se usar Vercel Web Analytics ou Speed Insights, eles não gravam cookies, mas cite-os na Política de Cookies (seção 3.1). Coloque links para os três documentos no rodapé do site, e a identificação da empresa (razão social, CNPJ, endereço e e-mail), exigida pelo Decreto 7.962/2013.
10. **Backups fora do servidor.** Hoje o backup diário fica no mesmo VPS, em `/var/backups/otavio-bot`, sem criptografia própria, e inclui os logins dos motores e uma cópia do `.env`. Se o VPS for perdido ou invadido, os backups vão junto. Recomendação: cópia diária criptografada para outro lugar (se for outro provedor, inclua-o no Anexo da Privacidade).

## 4. Riscos jurídicos encontrados no produto

1. **WhatsApp não oficial.** A conexão usa a biblioteca Baileys (protocolo do WhatsApp Web), não a API oficial da Meta. Os Termos do WhatsApp proíbem acesso automatizado não autorizado; o número pode ser banido e a Meta pode tomar medidas contra quem oferece a automação comercialmente. Hoje o uso é restrito (só aprovações para o número do próprio dono, até 30 mensagens por hora), o que reduz o risco. **Não ofereça atendimento a clientes finais ou envio para terceiros por essa conexão.** Para isso, use a WhatsApp Business Platform (API oficial). Os Termos (11.2) transferem o risco ao cliente e proíbem disparo em massa. Note também que a biblioteca usa a `libsignal` sob licença GPL-3.0, com obrigações para quem distribui o servidor (por exemplo, a imagem pública no GHCR).
2. **Assinaturas pessoais de IA.** O README diz que os bots rodam "com os modelos que você já paga (Claude Code e Codex logados no seu PC)". Em um SaaS da Domma, usar assinaturas de consumidor (Claude Pro/Max, ChatGPT) para atender clientes pagantes viola os termos desses planos. O SaaS precisa usar contas de API comerciais em nome da Domma (como os textos descrevem). Se o cliente puder conectar a própria conta, os Termos (11.9) tratam disso, mas confirme nos termos de cada provedor se o uso automatizado é permitido.
3. **Serviços do projeto original ainda ligados.** O código ainda envia ou pode enviar dados para serviços dos autores do OpenMausBot, que **não estão** na lista de suboperadores: relatórios de erro para `cloud.openmausbot.com` (`server/devs-report-send.ts`), o intermediário de apps conectados do Composio em `openmausbot-composio.milindsoni201.workers.dev` (`electron/managed-composio.mjs`), além de recursos de nuvem (`device.openmausbot.com`, Boat). Antes de publicar, desligue esses caminhos ou aponte para serviços da Domma (o `STATUS.md` já lista isso como pendência). Enviar dados de clientes a um terceiro não informado violaria a LGPD.
4. **Acesso total como padrão.** Os bots começam no nível de aprovação "Full access" (`docs/approval-levels.md`), agindo sem pedir confirmação. Para um SaaS vendido a consumidores, isso aumenta o risco de danos e de discussão sobre defeito do serviço (dever de segurança e informação do CDC). Recomendação: no SaaS, começar no nível "Perguntar" e deixar o cliente subir o nível com um aviso claro.
5. **Reuniões transcritas.** O bot de notas entra em reuniões e transcreve a fala de terceiros, e ainda se apresenta como "from MausBot" (`docs/meeting-notes.md`), nome de terceiro. Troque o texto para ArkoBot. Os Termos (11.7) põem no cliente o dever de informar os participantes.
6. **Marca do projeto original.** O app ainda usa o mascote do OpenMausBot como avatar padrão, que é marca registrada de terceiros (`docs/otavio-bot/STATUS.md`, item 1). Troque antes do lançamento comercial.
7. **Controle do computador e do celular do cliente.** Os bots podem operar o computador do cliente e, pelo app de celular, agenda, contatos, localização e envio de mensagens. Os Termos tratam disso (11.5 e 11.6), mas um erro do bot nesses ambientes tem impacto alto. Mantenha a confirmação por tarefa e mensagens claras no app.
8. **Créditos com validade e consumidor.** Ver decisões 1 e 2 acima.
9. **Decisões que afetam pessoas.** Clientes podem usar os bots para triagem de currículos, crédito ou atendimento. Os Termos (9.4) e o DPA põem no cliente o dever de revisão humana (art. 20 da LGPD). Se a regulação de IA no Brasil for aprovada (PL 2338/2023), revise os documentos.
10. **Conteúdo ilícito e remoção.** O STF mudou em 2025 o entendimento sobre o art. 19 do Marco Civil (responsabilidade por conteúdo de terceiros após notificação). Os Termos (15.4) preveem remoção após notificação fundamentada. Tenha um canal e um procedimento para receber essas notificações.

## 5. Onde cada prazo aparece

| Prazo | Termos | Privacidade | Cookies |
| --- | --- | --- | --- |
| Resposta ao atendimento: 5 dias | 1.3, 17.4 | | |
| Arrependimento: 7 dias, reembolso integral | 8.3 | | |
| Validade de créditos avulsos: 12 meses | 5.5 | | |
| Aviso de mudança de preço, de plano gratuito e dos Termos: 30 dias | 5.2, 6.5, 17.5, 20.1 | | |
| Aviso de mudança da Privacidade: 15 dias | | 19.1 | |
| Aviso de novo suboperador: 15 dias | Anexo I, I.4.3 | Anexo | |
| Inadimplência: suspensão em 10 dias, encerramento em 60 | 7.3, 7.4 | | |
| Exportação após encerramento: 30 dias; exclusão em mais 30 | 8.8 | 10 | |
| Backups: 14 dias | | 10 | |
| VPS adicional: apagado 15 dias após o fim | 12.6 | 10 | |
| Registros de acesso: 6 meses | | 10, 11 | |
| Dados de cadastro e fiscais: 5 anos | | 10 | |
| Incidente: cliente em 48 h; ANPD e titulares em 3 dias úteis | Anexo I, I.5 | 13 | |
| Pedido de titular: 15 dias | | 15.3 | |
| Sessão de login: 30 dias, máximo de 180 | | | 3.2 |
| Novo pedido de consentimento de cookies: 12 meses | | | 4.3 |
| Descontinuação do produto: 60 dias de aviso | 19.4 | | |

---

**Aviso importante:** estes documentos foram redigidos com base na legislação brasileira e no código do ArkoBot na data em que foram escritos, mas **não substituem a revisão de um advogado**. Antes de publicar, peça a um advogado com experiência em direito digital, proteção de dados e direito do consumidor que revise os três textos, as decisões da seção 2 e os riscos da seção 4, e que confirme se as normas citadas (em especial as resoluções da ANPD) continuam em vigor sem mudanças.
