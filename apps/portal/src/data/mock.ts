// Dados fictícios do protótipo do Portal. Nada aqui fala com IA ou backend.
// Texto com **negrito** e *itálico* é renderizado pelo componente <Rich>.

export type Status = "trabalhando" | "esperando" | "bloqueado" | "ocioso";
export type Provider = "Claude" | "ChatGPT" | "Grok" | "Gemini" | "OpenRouter" | "Local";
export type ColorKey = "vermelho" | "roxo" | "azul" | "verde" | "petroleo" | "rosa" | "laranja" | "mostarda" | "ciano";
export type HeadShape = "arredondada" | "quadrada" | "redonda" | "alta" | "larga";
export type Eyes = "brilhantes" | "pontos" | "visor" | "oculos" | "felizes" | "codigo" | "grafico";
export type Mouth = "sorriso" | "reto" | "bravo" | "aberto";
export type Accessory =
  | "nenhum"
  | "lapis"
  | "antena"
  | "fone"
  | "gorro"
  | "bone"
  | "estrela"
  | "chifres"
  | "topete"
  | "parafuso";

export interface Figurinha {
  head: HeadShape;
  eyes: Eyes;
  mouth: Mouth;
  /** cor da empresa do bot (azul para a Diretoria) */
  color: ColorKey;
  accessory: Accessory;
}

export interface Department {
  id: string;
  name: string;
  color: ColorKey;
  budgetMonth: number;
}

export interface Company {
  id: string;
  name: string;
  /** o que a empresa faz, mostrado ao lado do nome */
  tagline: string;
  /** cor da empresa: andar, placa e figurinhas dos bots */
  color: ColorKey;
  floor: number; // 0 = térreo, 4 = último andar
  floorLabel: string;
  mission: string;
  budget: { spent: number; cap: number };
  departments: Department[];
  tasks: { week: number; done: number; inProgress: number };
  rules: string[];
  heartbeats: { label: string; when: string }[];
}

export interface Bot {
  id: string;
  name: string;
  role: string;
  initials: string;
  companyId: string; // "diretoria" para o térreo
  departmentId: string;
  provider: Provider;
  model: string;
  reserve: string;
  status: Status;
  activity: string;
  budget: { spent: number; cap: number };
  figurinha: Figurinha;
  /** false enquanto a contratação espera o conselho */
  hired: boolean;
  personality?: string;
  /** onde o bot travou, quando status = bloqueado */
  blocker?: string;
}

export interface ApprovalOption {
  label: string;
  tone: "primary" | "secondary" | "danger";
  /** o que entra na auditoria quando a opção é escolhida */
  result: string;
  /** "aprovado" resolve positivamente; "recusado" negativamente; "adiado" mantém o cartão */
  outcome: "aprovado" | "recusado" | "adiado";
  /** rótulo usado no cartão dentro do chat, quando difere */
  chatLabel?: string;
  /** rótulo curto do celular */
  shortLabel?: string;
}

export interface Approval {
  id: string;
  botId: string;
  kind: "mensagem" | "contratar" | "orcamento";
  context: string;
  ago: string;
  tag: string;
  text: string;
  chips: string[];
  action: string;
  options: ApprovalOption[];
  /** bot contratado por este pedido, quando kind = contratar */
  hireBotId?: string;
  /** versão do pedido mostrada como cartão dentro da conversa */
  chat?: { rule: string; text: string; preview: string };
}

export type AuditTone = "ok" | "wait" | "block" | "deny";
export interface AuditEntry {
  id: string;
  time: string;
  bot: string;
  action: string;
  result: string;
  tone: AuditTone;
}

export interface Message {
  id: string;
  from: "voce" | "bot" | "outro";
  author: string;
  authorInitials: string;
  time: string;
  text: string;
  tools?: string[];
  approvalId?: string;
  audio?: string;
}

export type ChatSection = "salas" | "redbox" | "vertice" | "domma" | "foodx";

export interface Conversation {
  id: string;
  kind: "bot" | "sala";
  botId?: string;
  title: string;
  subtitle: string;
  section: ChatSection;
  time: string;
  preview: string;
  unread: number;
  messages: Message[];
  /** fora da barra lateral até ter mensagens */
  hidden?: boolean;
}

export interface FeedItem {
  id: string;
  tone: AuditTone;
  title: string;
  meta: string;
  action?: { label: string; to: string };
}

export const statusLabel: Record<Status, string> = {
  trabalhando: "trabalhando",
  esperando: "esperando sua aprovação",
  bloqueado: "bloqueado (login, 2FA)",
  ocioso: "ocioso",
};

/** Empresas do prédio, de cima para baixo. O térreo (recepção e conselho) fica fora desta lista. */
export const companies: Company[] = [
  {
    id: "redbox",
    name: "RedBox",
    tagline: "Agência de Marketing",
    color: "vermelho",
    floor: 4,
    floorLabel: "4º andar",
    mission: "entregar campanhas com CPA menor para os clientes da agência, com peças novas toda semana.",
    budget: { spent: 311, cap: 500 },
    departments: [
      { id: "trafego", name: "Tráfego pago", color: "vermelho", budgetMonth: 220 },
      { id: "criacao", name: "Criação", color: "vermelho", budgetMonth: 180 },
      { id: "atendimento", name: "Atendimento", color: "vermelho", budgetMonth: 100 },
    ],
    tasks: { week: 52, done: 44, inProgress: 8 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Subir orçamento de campanha: aprovação",
      "Publicar peça para cliente: aprovação do Diretor",
      "Nunca digitar códigos 2FA ou senhas",
      "Segredos escopados: Meta Business, Google Ads, Canva",
    ],
    heartbeats: [
      { label: "Max · relatório de Ads", when: "seg 08:00" },
      { label: "Rui · revisar CPA", when: "a cada hora" },
      { label: "Kim · mensagens de clientes", when: "a cada 10 min" },
    ],
  },
  {
    id: "vertice",
    name: "Vertice",
    tagline: "Produtora de Vídeos",
    color: "roxo",
    floor: 3,
    floorLabel: "3º andar",
    mission: "entregar os vídeos dos clientes com roteiro aprovado em 48 horas e cortes semanais para redes sociais.",
    budget: { spent: 164, cap: 350 },
    departments: [
      { id: "roteiro", name: "Roteiro", color: "roxo", budgetMonth: 90 },
      { id: "edicao", name: "Edição", color: "roxo", budgetMonth: 160 },
      { id: "captacao", name: "Captação", color: "roxo", budgetMonth: 100 },
    ],
    tasks: { week: 29, done: 24, inProgress: 5 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Publicar vídeo de cliente: aprovação",
      "Reservar estúdio ou equipe externa: aprovação",
      "Nunca usar música sem licença",
      "Segredos escopados: Frame.io, Google Drive, YouTube",
    ],
    heartbeats: [
      { label: "Lia · pauta de roteiros", when: "seg e qua 09:00" },
      { label: "Davi · fila de render", when: "a cada 30 min" },
      { label: "Noa · agenda de gravações", when: "diário 08:00" },
    ],
  },
  {
    id: "domma",
    name: "Domma Tecnologia",
    tagline: "Sistema e Programação",
    color: "petroleo",
    floor: 2,
    floorLabel: "2º andar",
    mission: "manter o sistema dos clientes estável, lançar o novo módulo de agendamento e responder o suporte em menos de 5 minutos.",
    budget: { spent: 206, cap: 450 },
    departments: [
      { id: "produto", name: "Produto", color: "petroleo", budgetMonth: 90 },
      { id: "desenvolvimento", name: "Desenvolvimento", color: "petroleo", budgetMonth: 240 },
      { id: "suporte", name: "Suporte", color: "petroleo", budgetMonth: 120 },
    ],
    tasks: { week: 37, done: 31, inProgress: 6 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Deploy em produção: aprovação",
      "Gasto acima do teto do bot: aprovação",
      "Nunca mexer em dados de clientes sem pedido escrito",
      "Segredos escopados: Supabase, GitHub, Sentry",
    ],
    heartbeats: [
      { label: "Gui · revisão de PRs", when: "a cada hora" },
      { label: "Sol · fila de chamados", when: "a cada 5 min" },
      { label: "Pri · roadmap", when: "sex 10:00" },
    ],
  },
  {
    id: "foodx",
    name: "FoodX",
    tagline: "Gestão de Restaurantes",
    color: "laranja",
    floor: 1,
    floorLabel: "1º andar",
    mission: "colocar 30 restaurantes novos no sistema neste trimestre e manter os atuais sem chamado parado.",
    budget: { spent: 206, cap: 500 },
    departments: [
      { id: "comercial", name: "Comercial", color: "laranja", budgetMonth: 200 },
      { id: "implantacao", name: "Implantação", color: "laranja", budgetMonth: 140 },
      { id: "suporte-restaurantes", name: "Suporte aos restaurantes", color: "laranja", budgetMonth: 160 },
    ],
    tasks: { week: 48, done: 41, inProgress: 7 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Mensagem para mais de 10 contatos: aprovação",
      "Gasto acima do teto do bot: aprovação",
      "Nunca dar desconto acima de 10% sem aprovação",
      "Segredos escopados: Pipedrive, Asaas, iFood, WhatsApp FoodX",
    ],
    heartbeats: [
      { label: "Bia · novos leads", when: "a cada 15 min" },
      { label: "Nina · chamados", when: "a cada 5 min" },
      { label: "Caio · implantações do dia", when: "diário 09:00" },
      { label: "Diretor · revisão semanal", when: "seg 08:00" },
    ],
  },
];

export const diretoria = { id: "diretoria", name: "Cobertura · Presidência", departmentId: "diretoria" };

const fig = (color: ColorKey, head: HeadShape, eyes: Eyes, accessory: Accessory, mouth: Mouth = "sorriso"): Figurinha => ({
  color,
  head,
  eyes,
  accessory,
  mouth,
});

export const bots: Bot[] = [
  {
    id: "tavinho",
    name: "Tavinho",
    role: "Diretor",
    initials: "TV",
    companyId: "diretoria",
    departmentId: "diretoria",
    provider: "Claude",
    model: "Claude Opus",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "define prioridades da semana",
    budget: { spent: 62, cap: 120 },
    figurinha: fig("azul", "redonda", "visor", "antena"),
    hired: true,
  },
  // RedBox · 4º andar
  {
    id: "max",
    name: "Max",
    role: "Google Ads",
    initials: "MA",
    companyId: "redbox",
    departmentId: "trafego",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "otimizando Academia Pulso",
    budget: { spent: 71, cap: 90 },
    figurinha: fig("vermelho", "quadrada", "grafico", "antena", "reto"),
    hired: true,
  },
  {
    id: "rui",
    name: "Rui",
    role: "Meta Ads",
    initials: "RU",
    companyId: "redbox",
    departmentId: "trafego",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "revisando CPA",
    budget: { spent: 68, cap: 90 },
    figurinha: fig("vermelho", "redonda", "visor", "chifres", "bravo"),
    hired: true,
  },
  {
    id: "duda",
    name: "Duda",
    role: "Copy",
    initials: "DU",
    companyId: "redbox",
    departmentId: "criacao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "4 anúncios da Academia Pulso",
    budget: { spent: 52, cap: 80 },
    figurinha: fig("vermelho", "alta", "brilhantes", "lapis", "reto"),
    hired: true,
  },
  {
    id: "otavio",
    name: "Otávio",
    role: "Designer",
    initials: "OT",
    companyId: "redbox",
    departmentId: "criacao",
    provider: "Grok",
    model: "Grok 4",
    reserve: "Claude · Sonnet",
    status: "bloqueado",
    activity: "travou no 2FA do Canva",
    blocker: "no login do Canva (2FA)",
    budget: { spent: 58, cap: 80 },
    figurinha: fig("vermelho", "arredondada", "brilhantes", "gorro"),
    hired: true,
    personality:
      "Você é o Otávio, designer da RedBox. Cria peças para anúncios (1080×1080 e 1080×1920) seguindo a paleta de cada cliente. Direto, sem enrolação. Sempre entrega 3 variações. Nunca publica nada sem aprovação do Diretor.",
  },
  {
    id: "kim",
    name: "Kim",
    role: "Atendimento",
    initials: "KI",
    companyId: "redbox",
    departmentId: "atendimento",
    provider: "ChatGPT",
    model: "GPT-5 mini",
    reserve: "Claude · Haiku",
    status: "trabalhando",
    activity: "respondendo clientes",
    budget: { spent: 34, cap: 60 },
    figurinha: fig("vermelho", "larga", "pontos", "fone"),
    hired: true,
  },
  // Vertice · 3º andar
  {
    id: "lia",
    name: "Lia",
    role: "Roteirista",
    initials: "LI",
    companyId: "vertice",
    departmentId: "roteiro",
    provider: "Claude",
    model: "Claude Haiku",
    reserve: "ChatGPT · GPT-5 mini",
    status: "ocioso",
    activity: "ociosa",
    budget: { spent: 22, cap: 60 },
    figurinha: fig("roxo", "redonda", "pontos", "estrela"),
    hired: true,
  },
  {
    id: "davi",
    name: "Davi",
    role: "Editor de vídeo",
    initials: "DA",
    companyId: "vertice",
    departmentId: "edicao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "esperando",
    activity: "corte final esperando sua aprovação",
    budget: { spent: 81, cap: 140 },
    figurinha: fig("roxo", "quadrada", "oculos", "fone", "reto"),
    hired: true,
  },
  {
    id: "noa",
    name: "Noa",
    role: "Produção",
    initials: "NO",
    companyId: "vertice",
    departmentId: "captacao",
    provider: "Gemini",
    model: "Gemini 2.5 Pro",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "3 gravações agendadas",
    budget: { spent: 41, cap: 80 },
    figurinha: fig("roxo", "arredondada", "felizes", "bone"),
    hired: true,
  },
  // Domma Tecnologia · 2º andar
  {
    id: "pri",
    name: "Pri",
    role: "Produto",
    initials: "PR",
    companyId: "domma",
    departmentId: "produto",
    provider: "Claude",
    model: "Claude Haiku",
    reserve: "ChatGPT · GPT-5 mini",
    status: "ocioso",
    activity: "ociosa",
    budget: { spent: 30, cap: 70 },
    figurinha: fig("petroleo", "alta", "felizes", "topete"),
    hired: true,
  },
  {
    id: "gui",
    name: "Gui",
    role: "Dev",
    initials: "GU",
    companyId: "domma",
    departmentId: "desenvolvimento",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "esperando",
    activity: "deploy do PR #142 esperando você",
    budget: { spent: 74, cap: 140 },
    figurinha: fig("petroleo", "larga", "codigo", "parafuso"),
    hired: true,
  },
  {
    id: "ze",
    name: "Zé",
    role: "QA",
    initials: "ZÉ",
    companyId: "domma",
    departmentId: "desenvolvimento",
    provider: "ChatGPT",
    model: "GPT-5 mini",
    reserve: "Claude · Haiku",
    status: "trabalhando",
    activity: "testando PR #142",
    budget: { spent: 39, cap: 90 },
    figurinha: fig("petroleo", "redonda", "oculos", "antena"),
    hired: true,
  },
  {
    id: "sol",
    name: "Sol",
    role: "Suporte",
    initials: "SO",
    companyId: "domma",
    departmentId: "suporte",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "4 chamados abertos",
    budget: { spent: 39, cap: 110 },
    figurinha: fig("petroleo", "arredondada", "pontos", "fone", "aberto"),
    hired: true,
  },
  // FoodX · 1º andar
  {
    id: "bia",
    name: "Bia",
    role: "SDR Restaurantes",
    initials: "BI",
    companyId: "foodx",
    departmentId: "comercial",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "3 restaurantes qualificados",
    budget: { spent: 54, cap: 90 },
    figurinha: fig("laranja", "redonda", "brilhantes", "fone"),
    hired: true,
  },
  {
    id: "teo",
    name: "Téo",
    role: "Propostas",
    initials: "TÉ",
    companyId: "foodx",
    departmentId: "comercial",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "esperando",
    activity: "precisa da sua aprovação",
    budget: { spent: 38, cap: 90 },
    figurinha: fig("laranja", "quadrada", "visor", "topete", "reto"),
    hired: true,
  },
  {
    id: "caio",
    name: "Caio",
    role: "Implantação",
    initials: "CA",
    companyId: "foodx",
    departmentId: "implantacao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "cardápio do Sabor de Minas",
    budget: { spent: 47, cap: 120 },
    figurinha: fig("laranja", "larga", "felizes", "bone"),
    hired: true,
  },
  {
    id: "nina",
    name: "Nina",
    role: "Suporte N1",
    initials: "NI",
    companyId: "foodx",
    departmentId: "suporte-restaurantes",
    provider: "ChatGPT",
    model: "GPT-5 mini",
    reserve: "Claude · Haiku",
    status: "trabalhando",
    activity: "2 chamados",
    budget: { spent: 41, cap: 80 },
    figurinha: fig("laranja", "arredondada", "pontos", "gorro"),
    hired: true,
  },
  // Diretores de cada empresa (ficam no saguão do andar, ao lado do elevador)
  {
    id: "rafa",
    name: "Rafa",
    role: "Diretor",
    initials: "RA",
    companyId: "redbox",
    departmentId: "direcao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "revisa as peças antes de ir ao cliente",
    budget: { spent: 28, cap: 50 },
    figurinha: fig("vermelho", "redonda", "oculos", "topete"),
    hired: true,
  },
  {
    id: "vera",
    name: "Vera",
    role: "Diretora",
    initials: "VE",
    companyId: "vertice",
    departmentId: "direcao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "Gemini · 2.5 Pro",
    status: "trabalhando",
    activity: "organiza a pauta de gravações",
    budget: { spent: 20, cap: 40 },
    figurinha: fig("roxo", "alta", "visor", "antena"),
    hired: true,
  },
  {
    id: "dante",
    name: "Dante",
    role: "Diretor",
    initials: "DN",
    companyId: "domma",
    departmentId: "direcao",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "prioriza o roadmap do trimestre",
    budget: { spent: 24, cap: 40 },
    figurinha: fig("petroleo", "quadrada", "grafico", "gorro", "reto"),
    hired: true,
  },
  {
    id: "fabio",
    name: "Fábio",
    role: "Diretor",
    initials: "FA",
    companyId: "foodx",
    departmentId: "direcao",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "acompanha a meta de 30 restaurantes",
    budget: { spent: 26, cap: 40 },
    figurinha: fig("laranja", "alta", "oculos", "estrela"),
    hired: true,
  },
  {
    id: "vini",
    name: "Vini",
    role: "Tráfego TikTok",
    initials: "VI",
    companyId: "redbox",
    departmentId: "trafego",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "esperando",
    activity: "na recepção, aguardando o conselho",
    budget: { spent: 0, cap: 60 },
    figurinha: fig("vermelho", "arredondada", "felizes", "estrela"),
    hired: false,
  },
];

export const figurinhaOrder = [
  "otavio",
  "tavinho",
  "max",
  "rui",
  "duda",
  "kim",
  "lia",
  "davi",
  "noa",
  "pri",
  "gui",
  "ze",
  "sol",
  "bia",
  "teo",
  "caio",
  "nina",
  "rafa",
  "vera",
  "dante",
  "fabio",
  "vini",
];

export const approvals: Approval[] = [
  {
    id: "ap-teo",
    botId: "teo",
    kind: "mensagem",
    context: "FoodX",
    ago: "há 2 min",
    tag: "regra: mais de 10 contatos",
    text: "Quer enviar a proposta da FoodX por WhatsApp para **12 restaurantes** que pediram demonstração e oferecer 3 horários de reunião com você a cada um.",
    chips: ["WhatsApp · 12 mensagens", "Agenda · até 12 convites", "custo estimado R$ 1,80", "ver conversa e prévia"],
    action: "whatsapp.enviar × 12",
    options: [
      { label: "Aprovar os 12", tone: "primary", result: "aprovado · 12 envios", outcome: "aprovado" },
      { label: "Aprovar só 3 primeiro", tone: "secondary", result: "aprovado · 3 envios", outcome: "aprovado", shortLabel: "Só 3 primeiro" },
      { label: "Pedir ajuste", tone: "secondary", result: "ajuste pedido", outcome: "adiado", chatLabel: "Editar mensagem", shortLabel: "Editar" },
      { label: "Recusar", tone: "danger", result: "recusado por você", outcome: "recusado" },
    ],
    chat: {
      rule: "regra: mensagens para mais de 10 contatos",
      text: "Enviar a proposta por WhatsApp para **12 restaurantes** com a mensagem abaixo e oferecer 3 horários de reunião a cada um.",
      preview:
        "Olá, {nome}! Aqui é da FoodX. Vi que o {restaurante} pediu uma demonstração do nosso sistema de gestão. Segue a proposta em PDF. Podemos conversar 20 minutos essa semana? Tenho {horário 1}, {horário 2} ou {horário 3}.",
    },
  },
  {
    id: "ap-davi",
    botId: "davi",
    kind: "mensagem",
    context: "Vertice",
    ago: "há 8 min",
    tag: "regra: entrega para cliente",
    text: "Quer entregar à Academia Pulso o **corte final de 30 segundos** da campanha de matrículas e publicar a versão aprovada no canal do cliente no YouTube.",
    chips: ["Frame.io · versão 3", "30s · 1080×1920 e 1920×1080", "trilha licenciada", "ver conversa e prévia"],
    action: "youtube.publicar corte-final-30s",
    options: [
      { label: "Aprovar entrega", tone: "primary", result: "aprovado · entregue ao cliente", outcome: "aprovado" },
      { label: "Pedir ajuste", tone: "secondary", result: "ajuste pedido", outcome: "adiado", shortLabel: "Ajustar" },
      { label: "Recusar", tone: "danger", result: "recusado por você", outcome: "recusado" },
    ],
    chat: {
      rule: "regra: vídeo para cliente precisa de aprovação",
      text: "Entregar o **corte final de 30s** à Academia Pulso e publicar no YouTube do cliente.",
      preview: "Corte final · 30s · abertura com a aluna na esteira, oferta “primeira aula grátis” aos 12s, logo e endereço no fim. Trilha do banco licenciado.",
    },
  },
  {
    id: "ap-gui",
    botId: "gui",
    kind: "mensagem",
    context: "Domma Tecnologia",
    ago: "há 15 min",
    tag: "regra: deploy em produção",
    text: "Quer fazer o **deploy em produção** do PR #142 (novo módulo de agendamento). O Zé rodou 214 testes e todos passaram.",
    chips: ["GitHub · PR #142", "214 testes ok", "janela: hoje 19:00", "plano de volta pronto", "ver conversa e prévia"],
    action: "github.deploy producao #142",
    options: [
      { label: "Aprovar deploy às 19:00", tone: "primary", result: "aprovado · deploy 19:00", outcome: "aprovado", shortLabel: "Aprovar" },
      { label: "Só em homologação", tone: "secondary", result: "aprovado · só homologação", outcome: "aprovado", shortLabel: "Homologação" },
      { label: "Recusar", tone: "danger", result: "recusado por você", outcome: "recusado" },
    ],
    chat: {
      rule: "regra: deploy em produção precisa de aprovação",
      text: "Publicar o **PR #142** em produção hoje às 19:00, com plano de volta pronto.",
      preview: "Mudanças: agenda por profissional, lembrete por WhatsApp 24h antes, migração de 2 tabelas no Supabase (reversível).",
    },
  },
  {
    id: "ap-vini",
    botId: "tavinho",
    kind: "contratar",
    context: "RedBox",
    ago: "há 25 min",
    tag: "contratar bot",
    hireBotId: "vini",
    text: "Propõe contratar **“Vini · Tráfego TikTok”** (ChatGPT, R$ 60/mês) na RedBox: dois clientes pediram TikTok Ads e o Max e o Rui já estão no limite.",
    chips: ["orçamento da empresa: R$ 500 → 560", "reporta a: Tráfego pago", "acessos: tiktok-ads (MCP), Drive"],
    action: "conselho.contratar Vini",
    options: [
      { label: "Revisar e contratar", tone: "primary", result: "contratação aprovada", outcome: "aprovado" },
      { label: "Depois", tone: "secondary", result: "adiado", outcome: "adiado" },
      { label: "Recusar", tone: "danger", result: "contratação recusada", outcome: "recusado" },
    ],
  },
  {
    id: "ap-max",
    botId: "max",
    kind: "orcamento",
    context: "RedBox",
    ago: "há 41 min",
    tag: "gasto acima do teto",
    text: "Quer subir o orçamento diário da campanha **Academia Pulso · Matrículas BH** de R$ 80 para R$ 120: CPA caiu 32% nos últimos 7 dias.",
    chips: ["conta Google Ads · Academia Pulso", "+R$ 1.200/mês do cliente", "ver análise"],
    action: "google-ads.orcamento 80 → 120",
    options: [
      { label: "Aprovar", tone: "primary", result: "aprovado · R$ 120/dia", outcome: "aprovado" },
      { label: "Aprovar até R$ 100", tone: "secondary", result: "aprovado · R$ 100/dia", outcome: "aprovado" },
      { label: "Recusar", tone: "danger", result: "recusado por você", outcome: "recusado" },
    ],
  },
];

export const audit: AuditEntry[] = [
  { id: "au-1", time: "15:33", bot: "Téo", action: "whatsapp.enviar × 12", result: "aguardando", tone: "wait" },
  { id: "au-2", time: "15:31", bot: "Téo", action: "pipedrive.listar_negocios", result: "permitido", tone: "ok" },
  { id: "au-3", time: "15:29", bot: "Otávio", action: "browser.abrir canva.com", result: "parou no 2FA", tone: "block" },
  { id: "au-4", time: "15:24", bot: "Davi", action: "youtube.publicar corte-final-30s", result: "aguardando", tone: "wait" },
  { id: "au-5", time: "15:18", bot: "Gui", action: "github.deploy producao #142", result: "aguardando", tone: "wait" },
  { id: "au-6", time: "15:12", bot: "Duda", action: "arquivo.gravar anuncios-academia-pulso.md", result: "permitido", tone: "ok" },
  { id: "au-7", time: "14:58", bot: "Lia", action: "browser.abrir instagram.com", result: "negado · site fora da lista", tone: "deny" },
  { id: "au-8", time: "14:40", bot: "Nina", action: "asaas.consultar_cobranca", result: "permitido", tone: "ok" },
];

export const feed: FeedItem[] = [
  {
    id: "f-1",
    tone: "wait",
    title: "**Propostas** quer enviar a proposta a 12 restaurantes",
    meta: "FoodX · há 2 min",
    action: { label: "aprovar", to: "/conselho" },
  },
  {
    id: "f-2",
    tone: "block",
    title: "**Design** travou no login do Canva (2FA)",
    meta: "RedBox · há 6 min",
    action: { label: "assumir", to: "/computador/otavio" },
  },
  {
    id: "f-3",
    tone: "ok",
    title: "**Copy** entregou 4 anúncios para Academia Pulso",
    meta: "RedBox · há 11 min",
    action: { label: "ver", to: "/chat/duda" },
  },
  {
    id: "f-4",
    tone: "ok",
    title: "**SDR Restaurantes** pediu um vídeo de demonstração à Vertice (subiu de elevador)",
    meta: "FoodX → Vertice · há 14 min",
  },
];

const m = (
  id: string,
  from: Message["from"],
  author: string,
  authorInitials: string,
  time: string,
  text: string,
  extra: Partial<Message> = {},
): Message => ({ id, from, author, authorInitials, time, text, ...extra });

export const conversations: Conversation[] = [
  {
    id: "teo",
    kind: "bot",
    botId: "teo",
    title: "Téo · Propostas",
    subtitle: "Comercial · FoodX",
    section: "foodx",
    time: "15:33",
    preview: "Preciso da sua aprovação para enviar a proposta",
    unread: 2,
    messages: [
      m(
        "teo-1",
        "voce",
        "Você",
        "OM",
        "15:31",
        "Téo, pega os restaurantes que pediram demonstração no Pipedrive essa semana, manda a proposta padrão e agenda reunião comigo pra quem responder.",
        { audio: "0:14" },
      ),
      m(
        "teo-2",
        "bot",
        "Téo · Claude",
        "TÉ",
        "15:31",
        "Fechado. Encontrei **12 restaurantes** marcados como \"Demonstração\" no Pipedrive desde segunda (8 de Google Ads, 4 de Instagram). Vou usar a proposta *FoodX Gestão 2026* do Drive e a agenda de demonstrações.",
        {
          tools: [
            'pipedrive.listar_negocios(etapa="Demonstração", desde="2026-11-02") → 12',
            'drive.ler("Proposta FoodX 2026.pdf")',
            "agenda.horarios_livres(otavio, 7 dias) → 9 janelas",
          ],
        },
      ),
      m("teo-3", "bot", "Téo", "TÉ", "15:33", "", { approvalId: "ap-teo" }),
      m(
        "teo-4",
        "outro",
        "Tavinho (CEO-bot)",
        "TV",
        "15:34",
        "Lembrete: a Bia já pediu à Vertice um vídeo curto de demonstração. Se quiser, o Téo manda o vídeo junto com a proposta assim que ficar pronto. [Ver pedido à Vertice]",
      ),
    ],
  },
  {
    id: "otavio",
    kind: "bot",
    botId: "otavio",
    title: "Otávio · Designer",
    subtitle: "Criação · RedBox",
    section: "redbox",
    time: "15:29",
    preview: "Travei no 2FA do Canva, preciso de você",
    unread: 1,
    messages: [
      m("ot-1", "voce", "Você", "OM", "15:20", "Otávio, monta as 4 variações da Academia Pulso no Canva com a paleta nova."),
      m("ot-2", "bot", "Otávio · Grok", "OT", "15:24", "Gerei as **4 variações** em ./variacoes (1080×1080 e 1080×1920). Vou subir no Canva para o cliente revisar.", {
        tools: ["python gerar_variacoes.py --briefing briefing-anuncios.md", "browser.abrir canva.com/login"],
      }),
      m(
        "ot-3",
        "bot",
        "Otávio · Grok",
        "OT",
        "15:29",
        "Travei no 2FA do Canva. Pela política eu não digito códigos. Clique em **Assumir controle** na tela do meu computador, digite o código e me devolva.",
      ),
    ],
  },
  {
    id: "duda",
    kind: "bot",
    botId: "duda",
    title: "Duda · Copy",
    subtitle: "Criação · RedBox",
    section: "redbox",
    time: "15:12",
    preview: "Os 4 anúncios da Academia Pulso estão prontos",
    unread: 3,
    messages: [
      m("du-1", "voce", "Você", "OM", "14:50", "Duda, escreve 4 anúncios para a Academia Pulso, foco em primeira aula grátis em BH."),
      m("du-2", "bot", "Duda · Claude", "DU", "15:10", "Escrevi os 4 anúncios com 3 títulos cada. Salvei em anuncios-academia-pulso.md.", {
        tools: ["arquivo.gravar anuncios-academia-pulso.md"],
      }),
      m("du-3", "bot", "Duda · Claude", "DU", "15:11", "O título que mais gostei: **Primeira aula grátis, sem taxa de matrícula.**"),
      m("du-4", "bot", "Duda · Claude", "DU", "15:12", "Já mandei para o Otávio montar as peças e para o Davi, da Vertice, cortar a versão em vídeo."),
    ],
  },
  {
    id: "sala-diretoria",
    kind: "sala",
    title: "Auto · Diretoria",
    subtitle: "Sala com Tavinho, Téo, Max e Duda",
    section: "salas",
    time: "14:30",
    preview: "o Tavinho escolhe quem responde",
    unread: 0,
    messages: [
      m("sd-1", "voce", "Você", "OM", "14:20", "Quero um resumo do que cada empresa entregou hoje."),
      m(
        "sd-2",
        "outro",
        "Tavinho (CEO-bot)",
        "TV",
        "14:21",
        "RedBox: 4 anúncios e 2 campanhas otimizadas. Vertice: 3 cortes em edição. Domma: PR #142 em revisão. FoodX: 12 restaurantes pediram demonstração.",
      ),
      m("sd-3", "outro", "Max · Google Ads", "MA", "14:30", "Complemento: o CPA da Academia Pulso caiu 32% em 7 dias."),
    ],
  },
  {
    id: "bia",
    kind: "bot",
    botId: "bia",
    title: "Bia · SDR Restaurantes",
    subtitle: "Comercial · FoodX",
    section: "foodx",
    time: "15:05",
    preview: "ChatGPT · 3 restaurantes qualificados",
    unread: 0,
    messages: [
      m("bi-1", "bot", "Bia · ChatGPT", "BI", "15:05", "Qualifiquei **3 restaurantes** em Contagem e Betim. Todos querem uma demonstração esta semana.", {
        tools: ["pipedrive.atualizar_negocio × 3"],
      }),
    ],
  },
  {
    id: "nina",
    kind: "bot",
    botId: "nina",
    title: "Nina · Suporte N1",
    subtitle: "Suporte aos restaurantes · FoodX",
    section: "foodx",
    time: "14:40",
    preview: "ChatGPT · 2 chamados",
    unread: 0,
    messages: [
      m(
        "ni-1",
        "bot",
        "Nina · ChatGPT",
        "NI",
        "14:40",
        "Dois chamados abertos: o Sabor de Minas não consegue fechar o caixa no sistema e a Pizzaria Bella pediu a segunda via do boleto.",
        { tools: ["asaas.consultar_cobranca(cliente=pizzaria-bella)"] },
      ),
    ],
  },
  {
    id: "lia",
    kind: "bot",
    botId: "lia",
    title: "Lia · Roteirista",
    subtitle: "Roteiro · Vertice",
    section: "vertice",
    time: "14:58",
    preview: "Claude · ociosa",
    unread: 0,
    messages: [
      m("li-1", "bot", "Lia · Claude", "LI", "14:58", "Tentei abrir o Instagram para ver referências de vídeos curtos, mas o site está fora da minha lista. Fico no aguardo da próxima pauta."),
    ],
  },
  {
    id: "max",
    kind: "bot",
    botId: "max",
    title: "Max · Google Ads",
    subtitle: "Tráfego pago · RedBox",
    section: "redbox",
    time: "14:52",
    preview: "ChatGPT · otimizando Academia Pulso",
    unread: 0,
    messages: [
      m("ma-1", "bot", "Max · ChatGPT", "MA", "14:52", "O CPA da **Academia Pulso · Matrículas BH** caiu 32% em 7 dias. Pedi ao conselho para subir o orçamento diário para R$ 120."),
    ],
  },
  {
    id: "davi",
    kind: "bot",
    botId: "davi",
    title: "Davi · Editor de vídeo",
    subtitle: "Edição · Vertice",
    section: "vertice",
    time: "15:24",
    preview: "Preciso da sua aprovação para entregar o corte",
    unread: 1,
    messages: [
      m("da-0", "voce", "Você", "OM", "14:10", "Davi, fecha o corte de 30s da Academia Pulso com os títulos da Duda."),
      m("da-1", "bot", "Davi · Claude", "DA", "15:20", "Corte final pronto: **30 segundos**, versões vertical e horizontal, trilha licenciada. A Vera já revisou.", {
        tools: ["frameio.enviar_versao(academia-pulso-corte-final, v3)", "youtube.preparar_envio(canal=academia-pulso)"],
      }),
      m("da-2", "bot", "Davi", "DA", "15:24", "", { approvalId: "ap-davi" }),
    ],
  },
  {
    id: "gui",
    kind: "bot",
    botId: "gui",
    title: "Gui · Dev",
    subtitle: "Desenvolvimento · Domma Tecnologia",
    section: "domma",
    time: "15:18",
    preview: "Preciso da sua aprovação para o deploy",
    unread: 1,
    messages: [
      m("gu-1", "bot", "Gui · Claude", "GU", "13:47", "Abri o **PR #142** com o novo módulo de agendamento. O Zé já está testando.", {
        tools: ["github.criar_pr(domma-sistema, #142)"],
      }),
      m("gu-2", "bot", "Gui · Claude", "GU", "15:16", "O Zé rodou **214 testes**, todos passaram. Revisei com a skill revisao-pull-request e preparei o plano de volta.", {
        tools: ["github.checks(#142) → 214 ok", "supabase.migracao --simular"],
      }),
      m("gu-3", "bot", "Gui", "GU", "15:18", "", { approvalId: "ap-gui" }),
    ],
  },
];

for (const b of bots) {
  if (b.hired && !conversations.some((c) => c.botId === b.id)) {
    const company = companies.find((c) => c.id === b.companyId);
    conversations.push({
      id: b.id,
      kind: "bot",
      botId: b.id,
      title: `${b.name} · ${b.role}`,
      subtitle: company ? `${company.departments.find((d) => d.id === b.departmentId)?.name ?? "Diretoria"} · ${company.name}` : diretoria.name,
      section: company ? (company.id as ChatSection) : "salas",
      time: "",
      preview: `${b.provider} · ${b.activity}`,
      unread: 0,
      messages: [],
      hidden: true,
    });
  }
}

export interface ComputerData {
  url: string;
  profile: string;
  container: string;
  tabs: string[];
  terminal: string[];
  files: { name: string; depth: number; kind: "folder" | "file" | "shared"; note?: string }[];
  logins: { site: string; account: string; ok: boolean }[];
  policies: string[];
  resources: { cpu: number; memory: string; memoryPct: number; tokens: string; tokensPct: number };
  recent: { text: string; tone: AuditTone }[];
  blockedNote?: string;
}

export const computers: Record<string, ComputerData> = {
  otavio: {
    url: "https://www.canva.com/login",
    profile: "perfil: design@redbox · só este bot",
    container: "Grok 4 (chave de API) · container Docker `redbox-design` · Ubuntu 24.04 · Chromium com perfil próprio · 2,1 GB em uso",
    tabs: ["Tela ao vivo", "Terminal", "Arquivos", "Logins do bot", "Auditoria"],
    terminal: [
      "$ ls ~/trabalho/academia-pulso",
      "briefing-anuncios.md   paleta-redbox.json   logo-academia-pulso.svg",
      "$ python gerar_variacoes.py --briefing briefing-anuncios.md --saida ./variacoes",
      "[ok] 4 variações geradas em ./variacoes (1080x1080, 1080x1920)",
      "$ open https://www.canva.com/login",
      "[gateway] navegação permitida (regra: dominio canva.com, bot Design)",
      "[gateway] campo de 2FA detectado → pedindo ajuda humana, bot em espera",
    ],
    files: [
      { name: "academia-pulso/", depth: 0, kind: "folder" },
      { name: "briefing-anuncios.md", depth: 1, kind: "file" },
      { name: "paleta-redbox.json", depth: 1, kind: "file" },
      { name: "variacoes/", depth: 1, kind: "folder", note: "4 arquivos" },
      { name: "cafe-serra-azul/", depth: 0, kind: "folder" },
      { name: "compartilhado/", depth: 0, kind: "shared", note: "RedBox" },
    ],
    logins: [
      { site: "Canva", account: "design@redbox", ok: true },
      { site: "Google Drive", account: "OAuth · RedBox", ok: true },
      { site: "Meta Business", account: "não conectado", ok: false },
    ],
    policies: [
      "Sites permitidos: canva.com, drive.google.com, business.facebook.com",
      "Nunca digitar códigos 2FA ou senhas",
      "Compras e pagamentos: sempre pedir aprovação",
      "Apagar arquivos fora de ~/trabalho: negado",
    ],
    resources: { cpu: 18, memory: "1,2 / 4 GB", memoryPct: 30, tokens: "R$ 6,40", tokensPct: 52 },
    recent: [
      { text: "Gerou 4 variações da Academia Pulso", tone: "ok" },
      { text: "Abriu o Canva (login próprio do bot)", tone: "ok" },
      { text: "Parou no código de 2FA", tone: "block" },
    ],
    blockedNote:
      "**O bot parou aqui.** Pela política, bots nunca digitam códigos 2FA. Clique em **Assumir controle**, digite o código e devolva. Enquanto você controla, o bot fica em espera.",
  },
  teo: {
    url: "foodx.pipedrive.com/pipeline/demonstracao",
    profile: "perfil: propostas@foodx · só este bot",
    container: "Claude Sonnet (sua assinatura) · container Docker `foodx-propostas` · Ubuntu 24.04 · Chromium com perfil próprio · 1,4 GB em uso",
    tabs: ["Tela ao vivo", "Terminal", "Arquivos", "Logins do bot", "Auditoria"],
    terminal: [
      "$ pipedrive negocios --etapa Demonstração --desde 2026-11-02",
      "12 contatos encontrados (8 Google Ads, 4 Instagram)",
      "$ drive baixar \"Proposta FoodX 2026.pdf\" ~/propostas/",
      "[ok] 2,3 MB salvos",
      "[gateway] whatsapp.enviar × 12 → regra: mais de 10 contatos, aguardando conselho",
    ],
    files: [
      { name: "propostas/", depth: 0, kind: "folder" },
      { name: "Proposta FoodX 2026.pdf", depth: 1, kind: "file" },
      { name: "restaurantes-semana.csv", depth: 1, kind: "file" },
      { name: "compartilhado/", depth: 0, kind: "shared", note: "FoodX" },
    ],
    logins: [
      { site: "Pipedrive", account: "propostas@foodx", ok: true },
      { site: "WhatsApp", account: "FoodX", ok: true },
      { site: "Google Drive", account: "OAuth · FoodX", ok: true },
    ],
    policies: [
      "Sites permitidos: pipedrive.com, drive.google.com, calendar.google.com",
      "Mensagens para mais de 10 contatos: pedir aprovação",
      "Nunca dar desconto acima de 10% sem aprovação",
    ],
    resources: { cpu: 9, memory: "0,9 / 4 GB", memoryPct: 22, tokens: "R$ 2,10", tokensPct: 26 },
    recent: [
      { text: "Abriu o Pipedrive (login próprio do bot)", tone: "ok" },
      { text: "Baixou a proposta do Drive para ~/propostas/", tone: "ok" },
      { text: "Aguardando aprovação para enviar 12 mensagens", tone: "wait" },
    ],
  },
};

export const botMemory: Record<string, string> = {
  teo: "Proposta padrão: *FoodX Gestão 2026* (skill proposta-restaurante). Demonstrações duram 20 min. Restaurantes de BH e região têm prioridade. Desconto acima de 10% só com aprovação.",
  otavio: "Paleta da Academia Pulso: preto #111827 e verde-limão #a3e635. Sempre 3 variações. O cliente prefere fotos reais a ilustrações.",
};

export const botSkills: Record<string, string[]> = {
  teo: ["Pipedrive", "WhatsApp", "Google Drive", "Agenda", "skill: proposta-restaurante"],
  otavio: ["Canva", "Google Drive", "skill: frontend-design"],
  gui: ["GitHub", "Supabase", "Sentry", "skill: revisao-pull-request"],
  davi: ["Frame.io", "Google Drive", "YouTube", "skill: roteiro-video-30s"],
};

export interface Skill {
  id: string;
  name: string;
  source: string;
  kind: "propria" | "github" | "gravada";
  bots: string[];
  state: "ativa" | "atualizar";
}

export const skills: Skill[] = [
  { id: "sk-1", name: "proposta-restaurante", source: "sua · FoodX · criada pelo Téo a partir de uma tarefa · v4", kind: "propria", bots: ["teo", "bia"], state: "ativa" },
  { id: "sk-2", name: "relatorio-campanha-cliente", source: "RedBox · gravada por você (Teach-a-task, 6 min) · roda seg 08:00", kind: "gravada", bots: ["max", "rui"], state: "ativa" },
  { id: "sk-3", name: "roteiro-video-30s", source: "sua · Vertice · gancho em 3 segundos e chamada final · v2", kind: "propria", bots: ["lia", "davi"], state: "ativa" },
  { id: "sk-4", name: "revisao-pull-request", source: "sua · Domma Tecnologia · checklist de segurança e testes · v3", kind: "propria", bots: ["gui", "ze"], state: "ativa" },
  { id: "sk-5", name: "docx · xlsx · pdf", source: "anthropics/skills · 3 skills · **atualização disponível**", kind: "github", bots: ["bia", "nina", "lia"], state: "atualizar" },
  { id: "sk-6", name: "frontend-design", source: "anthropics/skills · v2.1", kind: "github", bots: ["otavio", "gui"], state: "ativa" },
];

export interface McpServer {
  id: string;
  name: string;
  transport: "remoto" | "stdio";
  detail: string;
  ok: boolean;
  bots: string[]; // ids, ou ["todos"]
  warning?: string;
}

export const mcpServers: McpServer[] = [
  { id: "mcp-1", name: "google-ads · meta-ads", transport: "remoto", detail: "campanhas, métricas, orçamentos · só RedBox", ok: true, bots: ["max", "rui", "rafa"] },
  { id: "mcp-2", name: "frame.io · google-drive", transport: "remoto", detail: "versões de vídeo e comentários do cliente · só Vertice", ok: true, bots: ["davi", "lia", "noa"] },
  { id: "mcp-3", name: "github · supabase", transport: "remoto", detail: "PRs, deploys e banco do sistema · só Domma Tecnologia", ok: true, bots: ["gui", "ze"] },
  { id: "mcp-4", name: "ifood · pdv-foodx", transport: "remoto", detail: "cardápios, pedidos e caixa dos restaurantes · só FoodX", ok: true, bots: ["caio", "nina"] },
  { id: "mcp-5", name: "pipedrive · asaas", transport: "remoto", detail: "negócios, propostas e cobranças · só FoodX", ok: true, bots: ["bia", "teo", "nina"] },
  { id: "mcp-6", name: "filesystem", transport: "stdio", detail: "npx @modelcontextprotocol/server-filesystem ~/trabalho", ok: true, bots: ["todos"] },
  { id: "mcp-7", name: "whatsapp-oficial", transport: "remoto", detail: "", ok: false, bots: ["bia", "teo"], warning: "token expirado" },
];

export const connectedApps: { name: string; state: "ok" | "atencao" | "off" }[] = [
  { name: "Gmail", state: "ok" },
  { name: "Google Agenda", state: "ok" },
  { name: "Google Drive", state: "ok" },
  { name: "WhatsApp (QR)", state: "ok" },
  { name: "GitHub", state: "ok" },
  { name: "Canva", state: "atencao" },
  { name: "iFood", state: "ok" },
  { name: "Mercado Pago", state: "off" },
  { name: "Notion", state: "off" },
  { name: "Frame.io", state: "ok" },
];

export const modelKeys: { name: string; detail: string; ok: boolean; action?: string }[] = [
  { name: "Claude Code", detail: "assinatura · logado · usado por 8 bots", ok: true },
  { name: "Codex (ChatGPT)", detail: "assinatura · logado · usado por 7 bots", ok: true },
  { name: "xAI (Grok)", detail: "chave de API · criptografada · 1 bot", ok: true },
  { name: "Gemini", detail: "chave de API · 1 bot", ok: true },
  { name: "OpenRouter · Ollama local", detail: "não configurado", ok: false, action: "adicionar" },
];

export const councilRules = [
  "Contratar ou demitir bot",
  "Deploy em produção (Domma Tecnologia)",
  "Vídeo ou peça entregue a cliente (Vertice e RedBox)",
  "Mensagem para mais de 10 contatos",
  "Gasto acima do teto do bot ou da empresa",
  "Qualquer pagamento, compra ou assinatura",
  "Apagar arquivos fora da pasta de trabalho",
  "Ações no seu PC marcadas como destrutivas",
  "Proposta de estratégia do Diretor (semanal)",
];

export const policies = [
  { scope: "Todos os bots", rule: "deny: digitar senha ou código 2FA", effect: "negar e pedir ajuda humana" },
  { scope: "Todos os bots", rule: "deny: apagar fora de ~/trabalho", effect: "negar" },
  { scope: "RedBox", rule: "google-ads.orcamento acima do teto", effect: "pedir aprovação" },
  { scope: "Vertice", rule: "youtube.publicar ou entrega para cliente", effect: "pedir aprovação" },
  { scope: "Domma Tecnologia", rule: "github.deploy producao", effect: "pedir aprovação" },
  { scope: "FoodX", rule: "whatsapp.enviar com mais de 10 contatos", effect: "pedir aprovação" },
  { scope: "Otávio · Designer", rule: "browser: canva.com, drive.google.com, business.facebook.com", effect: "permitir" },
  { scope: "Lia · Roteirista", rule: "browser: instagram.com", effect: "negar (fora da lista)" },
];

export const weeklySummary =
  "166 tarefas concluídas nas 4 empresas, R$ 887 gastos (49% do teto). RedBox: CPA da Academia Pulso caiu 32% e 4 anúncios novos. Vertice: 3 cortes prontos, um esperando sua aprovação. Domma Tecnologia: PR #142 pronto para produção. FoodX: 12 restaurantes pediram demonstração. Para segunda, proponho aprovar o deploy, mandar as propostas e contratar o Vini.";

export const totalBudget = { spent: 887, cap: 1800 };

export const providerModels: Record<Provider, { label: string; models: string[]; note: string; access: "logada" | "chave" | "adicionar" | "local" }> = {
  Claude: { label: "Claude", models: ["Opus", "Sonnet", "Haiku"], note: "assinatura logada", access: "logada" },
  ChatGPT: { label: "ChatGPT", models: ["GPT-5", "GPT-5 mini", "o-series"], note: "assinatura logada", access: "logada" },
  Grok: { label: "Grok", models: ["Grok 4", "Grok 4 Fast", "Grok 3 mini"], note: "chave de API salva", access: "chave" },
  Gemini: { label: "Gemini", models: ["2.5 Pro", "2.5 Flash", "Flash-Lite"], note: "adicionar chave", access: "adicionar" },
  OpenRouter: { label: "OpenRouter", models: ["DeepSeek", "Llama", "Qwen", "Mistral..."], note: "adicionar chave", access: "adicionar" },
  Local: { label: "Modelo local", models: ["Ollama / LM Studio no seu PC"], note: "detectado · sem custo", access: "local" },
};

export const modelEstimates: Record<string, string> = {
  "Grok 4": "~R$ 38 a 65 / mês",
  "Grok 4 Fast": "~R$ 12 a 20 / mês",
  "Grok 3 mini": "~R$ 4 a 8 / mês",
  Opus: "R$ 0 pela assinatura (consome o limite do plano mais rápido)",
  Sonnet: "R$ 0 pela assinatura",
  Haiku: "R$ 0 pela assinatura",
  "GPT-5": "R$ 0 pela assinatura",
  "GPT-5 mini": "R$ 0 pela assinatura",
  "o-series": "R$ 0 pela assinatura",
  "2.5 Pro": "~R$ 30 a 50 / mês",
  "2.5 Flash": "~R$ 8 a 14 / mês",
  "Flash-Lite": "~R$ 2 a 5 / mês",
  DeepSeek: "~R$ 6 a 12 / mês",
  Llama: "~R$ 5 a 10 / mês",
  Qwen: "~R$ 5 a 10 / mês",
  "Mistral...": "~R$ 6 a 12 / mês",
  "Ollama / LM Studio no seu PC": "sem custo",
};

export const nowLabel = "domingo, 8 nov · 15:46";

/** Roupa de cada bot no prédio ao vivo. A cor da empresa aparece no crachá. */
export type OutfitTop = "camisa" | "camiseta" | "moletom" | "blazer" | "polo";
export interface Outfit {
  top: OutfitTop;
  color: string;
  tie?: boolean;
  pants?: string;
}

export const outfits: Record<string, Outfit> = {
  tavinho: { top: "blazer", color: "#1e3a8a", tie: true },
  rafa: { top: "blazer", color: "#27272a", tie: true },
  vera: { top: "blazer", color: "#4338ca" },
  dante: { top: "camisa", color: "#e2e8f0", tie: true },
  fabio: { top: "polo", color: "#f8fafc", pants: "#3f4a5e" },
  max: { top: "camisa", color: "#bfdbfe" },
  rui: { top: "moletom", color: "#4b5563", pants: "#335c8a" },
  duda: { top: "camiseta", color: "#fef3c7", pants: "#335c8a" },
  otavio: { top: "moletom", color: "#1f2937" },
  kim: { top: "polo", color: "#fecdd3" },
  lia: { top: "camiseta", color: "#fde68a", pants: "#335c8a" },
  davi: { top: "camisa", color: "#334155" },
  noa: { top: "moletom", color: "#65a30d", pants: "#335c8a" },
  pri: { top: "polo", color: "#c7d2fe" },
  gui: { top: "moletom", color: "#0f766e", pants: "#335c8a" },
  ze: { top: "camiseta", color: "#e5e7eb" },
  sol: { top: "camisa", color: "#ffffff", tie: true },
  bia: { top: "blazer", color: "#9a3412" },
  teo: { top: "camisa", color: "#dbeafe", tie: true },
  caio: { top: "polo", color: "#1e293b", pants: "#57534e" },
  nina: { top: "camiseta", color: "#fda4af", pants: "#335c8a" },
  vini: { top: "camiseta", color: "#ffedd5", pants: "#335c8a" },
};

const fallbackTops: OutfitTop[] = ["camiseta", "polo", "camisa", "moletom"];
export function outfitOf(bot: Pick<Bot, "id">): Outfit {
  const known = outfits[bot.id];
  if (known) return known;
  const h = [...bot.id].reduce((a, c) => a + c.charCodeAt(0), 0);
  return { top: fallbackTops[h % fallbackTops.length]!, color: ["#e5e7eb", "#bfdbfe", "#fde68a", "#c7d2fe"][h % 4]! };
}
