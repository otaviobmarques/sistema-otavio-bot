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
    diferencial: 'Assistente pessoal 24\u00a0h com IA gratuita',
    resumo: 'Para começar já: um assistente que trabalha dia e noite, sem configurar nenhuma IA.',
    precoMensal: 39,
    creditosIA: 0,
    diasGratis: 7,
    bots: '1 bot',
    itens: [
      'ArkoBot 24 horas na nuvem',
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
      'Créditos de IA inclusos',
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
      'Todas as IAs: ChatGPT, Claude, Gemini, Grok e outras',
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
      'Implantação acompanhada e suporte prioritário',
    ],
  },
];

export const computadorAdicional = {
  nome: 'Computador individual adicional',
  resumo: 'Dê a qualquer bot o seu próprio computador (VPS) individual. Disponível em todos os planos, inclusive no Inicial.',
  /** Valor mensal em reais, por bot. */
  precoMensal: 159,
};

export const creditosAvulsos = {
  nome: 'Pacotes de créditos avulsos',
  resumo: 'Para os meses de mais movimento, sem trocar de plano.',
  preco: 'A partir de R$ 50',
};

export const explicacaoCreditos =
  '1 crédito = R$ 0,01 de uso de IA. Os créditos do plano renovam todo mês. O Inicial usa a IA gratuita do ArkoBot, com limite diário. O uso de uma conta de IA sua não gasta créditos. Preços em reais, por mês, sem fidelidade.';

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
      { recurso: 'IA gratuita já inclusa (com limite diário)', valores: [true, false, false, false] },
      { recurso: 'Créditos de IA por mês', valores: [false, '4.000', '20.000', '40.000'] },
      { recurso: 'IAs disponíveis com créditos', valores: [false, 'Intermediárias', 'Todas', 'Todas'] },
      { recurso: 'Conectar a sua própria conta de IA ou chave de API', valores: [true, true, true, true] },
      { recurso: 'Pacotes de créditos avulsos', valores: [false, 'A partir de R$ 50', 'A partir de R$ 50', 'A partir de R$ 50'] },
    ],
  },
  {
    grupo: 'Computadores',
    linhas: [
      { recurso: 'Computadores individuais incluídos', valores: [false, false, '1', '2'] },
      { recurso: 'Computador adicional (R$ 159/mês por bot)', valores: [true, true, true, true] },
      { recurso: 'Ver a tela ao vivo e assumir o controle', valores: [true, true, true, true] },
    ],
  },
  {
    grupo: 'Funcionamento',
    linhas: [
      { recurso: 'ArkoBot 24 horas na nuvem', valores: ['Servidor compartilhado', true, true, true] },
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
