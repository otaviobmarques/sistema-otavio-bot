export type Fala = { de: 'bot' | 'voce'; texto: string };

export type Trabalho = {
  id: string;
  aba: string;
  bot: string;
  descricao: string;
  roda: string;
  usa: string;
  conversa: Fala[];
};

/** Exemplos ilustrativos com dados fictícios. */
export const trabalhos: Trabalho[] = [
  {
    id: 'vendas',
    aba: 'Vendas',
    bot: 'ana',
    descricao:
      'Encontra os orçamentos que esfriaram, descobre quem deve o próximo passo e escreve cada follow-up. Nada é enviado sem o seu sim.',
    roda: 'Dias úteis às 9h',
    usa: 'Gmail, HubSpot',
    conversa: [
      { de: 'bot', texto: 'Quatro orçamentos estão parados há mais de uma semana. O maior pediu condições de pagamento e ficou sem resposta.' },
      { de: 'bot', texto: 'Escrevi os quatro follow-ups com a proposta revisada. Seguro até você mandar enviar.' },
      { de: 'voce', texto: 'Pode enviar' },
      { de: 'bot', texto: 'Enviados. Aviso assim que alguém responder.' },
    ],
  },
  {
    id: 'chefe',
    aba: 'Chefe de gabinete',
    bot: 'leo',
    descricao:
      'Começa o seu dia com o que importa, organiza a agenda e passa cada pedido para o bot certo. Só traz para você o que precisa da sua decisão.',
    roda: 'Todo dia às 7h30',
    usa: 'Google Agenda, Gmail',
    conversa: [
      { de: 'bot', texto: 'Três coisas precisam de você hoje: um contrato para revisar, uma proposta esperando o seu ok e uma reunião às 14h que bate com outra.' },
      { de: 'bot', texto: 'Todos da reunião das 14h estão livres quinta às 11h. Seguro o convite até você confirmar.' },
      { de: 'voce', texto: 'Pode mudar' },
      { de: 'bot', texto: 'Mudei para quinta às 11h, com um recado explicando. Sua tarde ficou livre.' },
    ],
  },
  {
    id: 'atendimento',
    aba: 'Atendimento',
    bot: 'caio',
    descricao:
      'Responde clientes a qualquer hora, resolve as dúvidas comuns e separa o que é reclamação séria para você ver primeiro.',
    roda: 'A cada 30 minutos',
    usa: 'Gmail, WhatsApp',
    conversa: [
      { de: 'bot', texto: 'Esta noite respondi 12 clientes: prazos de entrega, trocas e segunda via de boleto.' },
      { de: 'bot', texto: 'Um cliente pede reembolso de um pedido com defeito. Preparei a resposta, mas reembolso é com você.' },
      { de: 'voce', texto: 'Aprovo o reembolso' },
      { de: 'bot', texto: 'Respondi o cliente e avisei o financeiro. Caso encerrado.' },
    ],
  },
  {
    id: 'financeiro',
    aba: 'Financeiro',
    bot: 'beto',
    descricao:
      'Confere o que entrou e o que venceu, cobra os atrasados com educação e preenche os portais de nota no computador dele.',
    roda: 'Segundas às 9h',
    usa: 'Gmail, Google Drive',
    conversa: [
      { de: 'bot', texto: 'Quatro boletos venceram na semana passada, somando R$ 5.020. Nenhum cliente respondeu ainda.' },
      { de: 'bot', texto: 'Escrevi lembretes gentis para os quatro, com a segunda via anexada. Espero o seu ok.' },
      { de: 'voce', texto: 'Manda' },
      { de: 'bot', texto: 'Cobranças enviadas. Te aviso quando os pagamentos entrarem.' },
    ],
  },
  {
    id: 'recrutamento',
    aba: 'Recrutamento',
    bot: 'rafa',
    descricao:
      'Lê os currículos que chegam, separa quem combina com a vaga e marca as entrevistas na sua agenda. O convite só sai com o seu sim.',
    roda: 'Dias úteis às 8h',
    usa: 'Gmail, Google Agenda',
    conversa: [
      { de: 'bot', texto: 'Chegaram 23 currículos para a vaga de vendedor. Cinco têm a experiência que você pediu.' },
      { de: 'bot', texto: 'Sugiro entrevistar três. Deixei os horários prontos na sua agenda de quinta.' },
      { de: 'voce', texto: 'Pode convidar' },
      { de: 'bot', texto: 'Convites enviados. Dois já confirmaram.' },
    ],
  },
  {
    id: 'marketing',
    aba: 'Marketing',
    bot: 'duda',
    descricao: 'Planeja a semana de posts, escreve no tom da sua marca e prepara as imagens. Nada é publicado sem você aprovar.',
    roda: 'Segundas às 10h',
    usa: 'Notion, Google Drive',
    conversa: [
      { de: 'bot', texto: 'Montei o calendário da semana: 5 posts e 1 e-mail para a base, todos no Notion.' },
      { de: 'bot', texto: 'As três primeiras peças estão prontas. Quer ver antes de agendar?' },
      { de: 'voce', texto: 'Pode agendar' },
      { de: 'bot', texto: 'Agendados para terça, quarta e quinta às 18h.' },
    ],
  },
  {
    id: 'concorrencia',
    aba: 'Concorrência',
    bot: 'nina',
    descricao: 'Acompanha preços, lançamentos e campanhas dos concorrentes e avisa só quando algo muda de verdade.',
    roda: 'Quartas às 8h',
    usa: 'Navegador no computador dela',
    conversa: [
      { de: 'bot', texto: 'Dois concorrentes baixaram o preço do produto mais vendido esta semana, em média 12%.' },
      { de: 'bot', texto: 'Comparei com as suas margens. Sugiro um cupom de 8% só para clientes antigos.' },
      { de: 'voce', texto: 'Gostei, prepara' },
      { de: 'bot', texto: 'Passei para a Duda criar a campanha. Ela te mostra antes de enviar.' },
    ],
  },
  {
    id: 'seo',
    aba: 'SEO',
    bot: 'teo',
    descricao: 'Encontra buscas que trazem clientes, escreve artigos para o seu site e acompanha a posição de cada página.',
    roda: 'Segundas às 6h',
    usa: 'Google Drive, navegador',
    conversa: [
      { de: 'bot', texto: 'Três buscas da sua região cresceram este mês e o seu site ainda não aparece nelas.' },
      { de: 'bot', texto: 'Escrevi um artigo para a primeira. Está no Drive esperando a sua revisão.' },
      { de: 'voce', texto: 'Revisei, pode publicar' },
      { de: 'bot', texto: 'Publicado. Acompanho a posição e te conto na segunda.' },
    ],
  },
];
