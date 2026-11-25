export type Acessorio = 'fone' | 'oculos' | 'antena' | 'boina' | 'gravata' | 'coque' | 'bone' | 'viseira';

export type BotDaEquipe = {
  id: string;
  nome: string;
  funcao: string;
  faz: string;
  cores: [string, string];
  rosto: string;
  acessorio: Acessorio;
};

/** Bots de exemplo usados nas ilustrações do site (não são clientes nem pessoas reais). */
export const equipe: BotDaEquipe[] = [
  {
    id: 'leo',
    nome: 'Léo',
    funcao: 'Chefe de gabinete',
    faz: 'Recebe o seu pedido e divide o trabalho entre os outros bots.',
    cores: ['#00E8F8', '#1E5BFF'],
    rosto: '#E8FDFF',
    acessorio: 'gravata',
  },
  {
    id: 'ana',
    nome: 'Ana',
    funcao: 'Vendas',
    faz: 'Responde orçamentos, faz follow-up e atualiza o CRM.',
    cores: ['#FF5FA2', '#B5179E'],
    rosto: '#FFF0F6',
    acessorio: 'fone',
  },
  {
    id: 'nina',
    nome: 'Nina',
    funcao: 'Concorrência',
    faz: 'Acompanha preços, lançamentos e campanhas dos concorrentes.',
    cores: ['#FFC542', '#F07C00'],
    rosto: '#FFF8E6',
    acessorio: 'coque',
  },
  {
    id: 'duda',
    nome: 'Duda',
    funcao: 'Marketing',
    faz: 'Escreve posts, e-mails e campanhas no tom da sua marca.',
    cores: ['#A78BFA', '#6D28D9'],
    rosto: '#F4F0FF',
    acessorio: 'boina',
  },
  {
    id: 'beto',
    nome: 'Beto',
    funcao: 'Financeiro',
    faz: 'Confere pagamentos, cobra atrasados e preenche portais de notas.',
    cores: ['#34D399', '#047857'],
    rosto: '#EAFFF5',
    acessorio: 'oculos',
  },
  {
    id: 'caio',
    nome: 'Caio',
    funcao: 'Atendimento',
    faz: 'Responde clientes a qualquer hora e passa o que é sério para você.',
    cores: ['#60A5FA', '#1D4ED8'],
    rosto: '#EEF5FF',
    acessorio: 'antena',
  },
  {
    id: 'rafa',
    nome: 'Rafa',
    funcao: 'Recrutamento',
    faz: 'Triagem de currículos, agenda entrevistas e responde candidatos.',
    cores: ['#FB923C', '#C2410C'],
    rosto: '#FFF3EA',
    acessorio: 'bone',
  },
  {
    id: 'teo',
    nome: 'Teo',
    funcao: 'SEO',
    faz: 'Encontra oportunidades de busca e escreve conteúdo para o site.',
    cores: ['#2DD4BF', '#0F766E'],
    rosto: '#E9FFFB',
    acessorio: 'viseira',
  },
];

export function botPorId(id: string): BotDaEquipe {
  const bot = equipe.find((b) => b.id === id);
  if (!bot) throw new Error(`Bot desconhecido: ${id}`);
  return bot;
}
