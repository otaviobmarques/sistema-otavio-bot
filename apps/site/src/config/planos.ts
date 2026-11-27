/**
 * Planos e preços do site. É o único lugar para mexer em valores e itens.
 *
 * Com `precosDefinidos = false`, o site esconde os valores e mostra "Em breve" e "Fale com a gente".
 */
export const precosDefinidos = true;

export type Plano = {
  /** Código do plano na Central (`plans.code`): vai no link de cadastro (`?plano=`). */
  id: string;
  nome: string;
  /** O que este degrau acrescenta ao anterior, em uma frase curta: é o título do cartão. */
  diferencial: string;
  resumo: string;
  /** Valor mensal em reais. */
  precoMensal: number;
  /** Créditos de IA inclusos por mês (1 crédito = R$ 0,01 de uso de IA). Zero: o plano usa a IA gratuita. */
  creditosIA: number;
  /** Dias grátis na primeira assinatura de cada CPF/CNPJ (igual a `plans.trial_days` na Central). */
  diasGratis?: number;
  bots: string;
  itens: string[];
  destaque?: boolean;
};

export const planos: Plano[] = [
  {
    id: 'inicial',
    nome: 'Inicial',
    diferencial: 'Assistente pessoal com IA gratuita',
    resumo: 'Para começar já: um assistente na nuvem, sem precisar de conta em nenhuma IA.',
    precoMensal: 39,
    creditosIA: 0,
    diasGratis: 7,
    bots: '1 bot',
    itens: [
      'Servidor compartilhado: dorme após 30 min sem uso e acorda ao abrir',
      '5 GB de espaço',
      '1 empresa no Prédio',
      'App para PC e celular',
    ],
  },
  {
    id: 'essencial',
    nome: 'Essencial',
    diferencial: 'Bots que trabalham sozinhos',
    resumo: 'Rotinas agendadas e aprovações pelo WhatsApp: a equipe faz o repetitivo sem você pedir.',
    precoMensal: 159,
    creditosIA: 4000,
    bots: 'Até 3 bots',
    itens: [
      'Rotinas agendadas',
      'Aprovações pelo WhatsApp',
      'IA Claude inclusa nos créditos',
      '20 GB de espaço',
      '1 empresa no Prédio',
    ],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    diferencial: 'Computador próprio na nuvem',
    resumo: 'Os bots usam um computador de verdade: sistemas, planilhas e notas fiscais.',
    precoMensal: 599,
    creditosIA: 20000,
    bots: 'Até 10 bots',
    itens: [
      '1 computador individual incluído',
      '50 GB de espaço',
      'Até 3 empresas (andares)',
      'Tudo do Essencial',
    ],
    destaque: true,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    diferencial: 'Gestão de várias empresas',
    resumo: 'O Prédio completo: um andar por empresa, com regras e orçamento de IA próprios.',
    precoMensal: 999,
    creditosIA: 40000,
    bots: 'Bots ilimitados (uso justo)',
    itens: [
      'Empresas ilimitadas',
      'Regras e orçamento por empresa',
      '2 computadores individuais incluídos',
      '100 GB de espaço',
      'Implantação acompanhada e suporte prioritário',
    ],
  },
];

export const computadorAdicional = {
  nome: 'Computador individual adicional',
  resumo: 'Dê a qualquer bot o seu próprio computador (VPS) individual. Disponível em todos os planos, inclusive no Inicial.',
  /** Valor mensal em reais, por computador. */
  precoMensal: 159,
};

export const creditosAvulsos = {
  nome: 'Pacotes de créditos avulsos',
  resumo: 'Para os meses de mais movimento, sem trocar de plano.',
  preco: 'A partir de R$ 50',
};

export const explicacaoCreditos =
  '1 crédito = R$ 0,01 de uso de IA. Os créditos do plano renovam todo mês e hoje usam os modelos Claude, da Anthropic (GPT e Gemini em breve). O Inicial usa a IA gratuita do ArkoBot: modelos abertos e planos gratuitos de Groq, Google Gemini, NVIDIA e OpenRouter, com limite de cerca de 200 pedidos por dia, e que podem ficar mais lentos ou fora do ar. O uso de uma conta de IA sua não gasta créditos. Preços em reais, por mês, sem fidelidade.';

export const garantia =
  'Contratou pelo site e não gostou? Cancele em até 7 dias e receba o seu dinheiro de volta, como garante o Código de Defesa do Consumidor.';

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function precoPorDia(precoMensal: number): string {
  return (precoMensal / 30).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Valor = string | boolean;
export type GrupoComparativo = { grupo: string; linhas: { recurso: string; valores: [Valor, Valor, Valor, Valor] }[] };

/** Tabela "Comparar todos os recursos", na ordem Inicial, Essencial, Profissional, Empresa. */
export const comparativo: GrupoComparativo[] = [
  {
    grupo: 'Equipe',
    linhas: [
      { recurso: 'Bots', valores: ['1', 'Até 3', 'Até 10', 'Ilimitados (uso justo)'] },
      { recurso: 'Empresas no Prédio', valores: ['1', '1', 'Até 3', 'Ilimitadas'] },
      { recurso: 'Regras e orçamento por empresa', valores: [false, false, true, true] },
      { recurso: 'Bots conversando e passando tarefas entre si', valores: [false, true, true, true] },
    ],
  },
  {
    grupo: 'Inteligência artificial',
    linhas: [
      { recurso: 'IA gratuita já inclusa (cerca de 200 pedidos por dia)', valores: [true, false, false, false] },
      { recurso: 'Créditos de IA por mês', valores: [false, '4.000', '20.000', '40.000'] },
      { recurso: 'IA dos créditos', valores: [false, 'Claude (Anthropic)', 'Claude (Anthropic)', 'Claude (Anthropic)'] },
      { recurso: 'GPT e Gemini com créditos', valores: [false, 'Em breve', 'Em breve', 'Em breve'] },
      { recurso: 'Conectar a sua própria conta de IA ou chave de API', valores: [true, true, true, true] },
      { recurso: 'Pacotes de créditos avulsos', valores: [false, 'A partir de R$ 50', 'A partir de R$ 50', 'A partir de R$ 50'] },
    ],
  },
  {
    grupo: 'Computadores',
    linhas: [
      { recurso: 'Computadores individuais incluídos', valores: [false, false, '1', '2'] },
      { recurso: 'Computador adicional (R$ 159/mês cada)', valores: [true, true, true, true] },
      { recurso: 'Ver a tela ao vivo e assumir o controle', valores: [true, true, true, true] },
    ],
  },
  {
    grupo: 'Funcionamento',
    linhas: [
      { recurso: 'ArkoBot na nuvem, no seu endereço (nome.arkobot.com.br)', valores: [true, true, true, true] },
      { recurso: 'Ligado 24 horas', valores: ['Servidor compartilhado; dorme após 30 min sem uso', true, true, true] },
      { recurso: 'Espaço para arquivos', valores: ['5 GB', '20 GB', '50 GB', '100 GB'] },
      { recurso: 'Rotinas agendadas', valores: [false, true, true, true] },
      { recurso: 'Aprovações pelo WhatsApp', valores: [false, true, true, true] },
      { recurso: 'Apps conectados (Gmail, Notion, HubSpot…)', valores: [true, true, true, true] },
      { recurso: 'App para PC e celular', valores: [true, true, true, true] },
    ],
  },
  {
    grupo: 'Suporte',
    linhas: [
      { recurso: 'Teste grátis', valores: ['7 dias', false, false, false] },
      { recurso: 'Implantação acompanhada e suporte prioritário', valores: [false, false, false, true] },
      { recurso: 'Sem fidelidade', valores: [true, true, true, true] },
    ],
  },
];

export function formatarCreditos(valor: number): string {
  return valor.toLocaleString('pt-BR');
}
