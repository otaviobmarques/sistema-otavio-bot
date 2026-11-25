/**
 * Planos e preços do site. É o único lugar para mexer em valores e itens.
 *
 * Com `precosDefinidos = false`, o site esconde os valores e mostra "Em breve" e "Fale com a gente".
 */
export const precosDefinidos = true;

export type Plano = {
  id: string;
  nome: string;
  resumo: string;
  /** Valor mensal em reais. */
  precoMensal: number;
  /** Créditos de IA inclusos por mês (1 crédito = R$ 0,01 de uso de IA). */
  creditosIA: number;
  bots: string;
  itens: string[];
  destaque?: boolean;
};

export const planos: Plano[] = [
  {
    id: 'essencial',
    nome: 'Essencial',
    resumo: 'Para tirar o trabalho repetitivo das suas costas com uma equipe enxuta.',
    precoMensal: 159,
    creditosIA: 4000,
    bots: 'Até 3 bots',
    itens: [
      'ArkoBot 24 horas na nuvem',
      'IAs intermediárias',
      'Aprovações pelo WhatsApp',
      '1 empresa no Prédio',
      'App para PC e celular',
    ],
  },
  {
    id: 'profissional',
    nome: 'Profissional',
    resumo: 'Para a empresa que quer uma equipe completa trabalhando o dia todo.',
    precoMensal: 599,
    creditosIA: 20000,
    bots: 'Até 10 bots',
    itens: [
      'Todas as IAs: ChatGPT, Claude, Gemini, Grok e outras',
      '1 computador individual incluído',
      'Até 3 empresas (andares)',
      'Regras e orçamento por empresa',
      'Aprovações pelo WhatsApp',
    ],
    destaque: true,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    resumo: 'Para operações maiores, com vários bots usando computador próprio.',
    precoMensal: 999,
    creditosIA: 40000,
    bots: 'Bots ilimitados (uso justo)',
    itens: [
      'Todas as IAs',
      '2 computadores individuais incluídos',
      'Empresas ilimitadas',
      'Regras e orçamento por empresa',
      'Suporte prioritário',
    ],
  },
];

export const computadorAdicional = {
  nome: 'Computador individual adicional',
  resumo: 'Dê a qualquer bot o seu próprio computador (VPS) individual. Disponível em todos os planos.',
  /** Valor mensal em reais, por bot. */
  precoMensal: 159,
};

export const creditosAvulsos = {
  nome: 'Pacotes de créditos avulsos',
  resumo: 'Para os meses de mais movimento, sem trocar de plano.',
  preco: 'Sob consulta',
};

export const explicacaoCreditos =
  '1 crédito = R$ 0,01 de uso de IA. Os créditos do plano renovam todo mês. O uso de uma conta de IA sua não gasta créditos. Preços em reais, por mês, sem fidelidade.';

export const garantia =
  'Contratou pelo site e não gostou? Cancele em até 7 dias e receba o seu dinheiro de volta, como garante o Código de Defesa do Consumidor.';

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}

export function precoPorDia(precoMensal: number): string {
  return (precoMensal / 30).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

type Valor = string | boolean;
export type GrupoComparativo = { grupo: string; linhas: { recurso: string; valores: [Valor, Valor, Valor] }[] };

/** Tabela "Comparar todos os recursos", na ordem Essencial, Profissional, Empresa. */
export const comparativo: GrupoComparativo[] = [
  {
    grupo: 'Equipe',
    linhas: [
      { recurso: 'Bots', valores: ['Até 3', 'Até 10', 'Ilimitados (uso justo)'] },
      { recurso: 'Empresas no Prédio', valores: ['1', 'Até 3', 'Ilimitadas'] },
      { recurso: 'Regras e orçamento por empresa', valores: [false, true, true] },
      { recurso: 'Bots conversando e passando tarefas entre si', valores: [true, true, true] },
    ],
  },
  {
    grupo: 'Inteligência artificial',
    linhas: [
      { recurso: 'Créditos de IA por mês', valores: ['4.000', '20.000', '40.000'] },
      { recurso: 'IAs disponíveis', valores: ['Intermediárias', 'Todas', 'Todas'] },
      { recurso: 'Conectar a sua própria conta de IA ou chave de API', valores: [true, true, true] },
      { recurso: 'Pacotes de créditos avulsos', valores: ['Sob consulta', 'Sob consulta', 'Sob consulta'] },
    ],
  },
  {
    grupo: 'Computadores',
    linhas: [
      { recurso: 'Computadores individuais incluídos', valores: [false, '1', '2'] },
      { recurso: 'Computador adicional (R$ 159/mês por bot)', valores: [true, true, true] },
      { recurso: 'Ver a tela ao vivo e assumir o controle', valores: [true, true, true] },
    ],
  },
  {
    grupo: 'Funcionamento',
    linhas: [
      { recurso: 'ArkoBot 24 horas na nuvem', valores: [true, true, true] },
      { recurso: 'Aprovações pelo WhatsApp', valores: [true, true, true] },
      { recurso: 'Rotinas e automações', valores: [true, true, true] },
      { recurso: 'Apps conectados (Gmail, Notion, HubSpot…)', valores: [true, true, true] },
      { recurso: 'App para PC e celular', valores: [true, true, true] },
    ],
  },
  {
    grupo: 'Suporte',
    linhas: [
      { recurso: 'Suporte prioritário', valores: [false, false, true] },
      { recurso: 'Sem fidelidade', valores: [true, true, true] },
    ],
  },
];

export function formatarCreditos(valor: number): string {
  return valor.toLocaleString('pt-BR');
}
