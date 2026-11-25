/**
 * Planos e preços do site. É o único lugar para mexer em valores.
 *
 * Enquanto `precosDefinidos` for `false`, o site NÃO mostra nenhum valor: cada
 * plano aparece com "Em breve" e o botão "Fale com a gente". Os números abaixo
 * são EXEMPLOS para testar o layout; troque pelos preços reais e só então mude
 * `precosDefinidos` para `true`.
 */
export const precosDefinidos = false;

export type Plano = {
  id: string;
  nome: string;
  resumo: string;
  /** Valor mensal em reais. Só aparece com `precosDefinidos = true`. */
  precoMensal: number;
  /** Créditos de IA inclusos por mês, em reais de consumo. */
  creditosIA: number;
  bots: string;
  computadoresInclusos: number;
  itens: string[];
  destaque?: boolean;
};

export const planos: Plano[] = [
  {
    id: 'essencial',
    nome: 'Essencial',
    resumo: 'Para começar com uma equipe pequena de bots em uma empresa.',
    precoMensal: 297,
    creditosIA: 100,
    bots: 'Até 3 bots',
    computadoresInclusos: 0,
    itens: [
      'Créditos de IA inclusos no mês',
      '1 empresa no Prédio',
      'Aprovações pelo app e pelo WhatsApp',
      'Rotinas agendadas',
      'App para PC e celular',
    ],
  },
  {
    id: 'equipe',
    nome: 'Equipe',
    resumo: 'Para quem quer bots trabalhando o dia todo, com computador próprio.',
    precoMensal: 797,
    creditosIA: 300,
    bots: 'Até 10 bots',
    computadoresInclusos: 1,
    itens: [
      'Mais créditos de IA inclusos no mês',
      'Várias empresas, cada uma com sua verba',
      'Regras de aprovação por empresa',
      '1 computador na nuvem para os bots',
      'Ensinar uma tarefa gravando a tela',
    ],
    destaque: true,
  },
  {
    id: 'empresa',
    nome: 'Empresa',
    resumo: 'Para operações maiores, com vários computadores e acompanhamento.',
    precoMensal: 1997,
    creditosIA: 1000,
    bots: 'Bots sob medida',
    computadoresInclusos: 3,
    itens: [
      'Créditos de IA sob medida',
      'Empresas e equipes ilimitadas',
      '3 computadores na nuvem para os bots',
      'Servidor 24 horas dedicado',
      'Implantação acompanhada',
    ],
  },
];

export const computadorAdicional = {
  nome: 'Computador adicional',
  resumo:
    'Um desktop na nuvem só para um bot: ele navega, usa programas e trabalha nele, e você acompanha a tela ao vivo.',
  /** Valor mensal em reais por computador. Só aparece com `precosDefinidos = true`. */
  precoMensal: 197,
};

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
