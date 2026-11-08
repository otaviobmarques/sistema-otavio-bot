// Dados fictícios do protótipo do Portal. Nada aqui fala com IA ou backend.
// Texto com **negrito** e *itálico* é renderizado pelo componente <Rich>.

export type Status = "trabalhando" | "esperando" | "bloqueado" | "ocioso";
export type Provider = "Claude" | "ChatGPT" | "Grok" | "Gemini" | "OpenRouter" | "Local";
export type ColorKey = "roxo" | "azul" | "verde" | "petroleo" | "rosa" | "laranja" | "mostarda" | "ciano";
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
  floor: number; // 0 = térreo, 4 = cobertura
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
  companyId: string; // "diretoria" para a cobertura
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

export interface Conversation {
  id: string;
  kind: "bot" | "sala";
  botId?: string;
  title: string;
  subtitle: string;
  section: "salas" | "master-laudo" | "redbox" | "domma";
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

export const companies: Company[] = [
  {
    id: "domma",
    name: "Domma IA",
    floor: 3,
    floorLabel: "3º andar",
    mission: "lançar o Domma Chat para clínicas e manter o suporte abaixo de 5 minutos de resposta.",
    budget: { spent: 182, cap: 400 },
    departments: [
      { id: "produto", name: "Produto", color: "mostarda", budgetMonth: 180 },
      { id: "suporte", name: "Suporte", color: "petroleo", budgetMonth: 90 },
      { id: "vendas", name: "Vendas", color: "verde", budgetMonth: 130 },
    ],
    tasks: { week: 37, done: 31, inProgress: 6 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Deploy em produção: aprovação",
      "Gasto acima do teto do bot: aprovação",
      "Nunca mexer em dados de pacientes sem pedido escrito",
      "Segredos escopados: Supabase, GitHub, WhatsApp Domma",
    ],
    heartbeats: [
      { label: "Gui · revisão de PRs", when: "a cada hora" },
      { label: "Sol · fila de chamados", when: "a cada 5 min" },
      { label: "Noa · novos leads", when: "a cada 15 min" },
    ],
  },
  {
    id: "redbox",
    name: "RedBox IA",
    floor: 2,
    floorLabel: "2º andar",
    mission: "entregar campanhas com CPA menor para os clientes da agência, com peças novas toda semana.",
    budget: { spent: 311, cap: 500 },
    departments: [
      { id: "trafego", name: "Tráfego pago", color: "laranja", budgetMonth: 220 },
      { id: "criacao", name: "Criação", color: "roxo", budgetMonth: 180 },
      { id: "atendimento", name: "Atendimento", color: "ciano", budgetMonth: 100 },
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
    id: "master-laudo",
    name: "Master Laudo IA",
    floor: 1,
    floorLabel: "1º andar",
    mission: "aumentar as pesquisas vendidas e reduzir o tempo de atendimento das 100+ lojas em Minas Gerais.",
    budget: { spent: 240, cap: 600 },
    departments: [
      { id: "comercial", name: "Comercial", color: "verde", budgetMonth: 120 },
      { id: "suporte-lojas", name: "Suporte às lojas", color: "petroleo", budgetMonth: 90 },
      { id: "marketing", name: "Marketing", color: "rosa", budgetMonth: 30 },
    ],
    tasks: { week: 48, done: 41, inProgress: 7 },
    rules: [
      "Contratar bot: aprovação do conselho",
      "Mensagem para mais de 10 contatos: aprovação",
      "Gasto acima do teto do bot: aprovação",
      "Nunca falar de preço de franquia antes da reunião",
      "Segredos escopados: Goalfy, Asaas, WhatsApp Master Laudo",
    ],
    heartbeats: [
      { label: "Diretor · revisão semanal", when: "seg 08:00" },
      { label: "SDR Lojas · novos leads", when: "a cada 15 min" },
      { label: "Suporte N1 · chamados", when: "a cada 5 min" },
      { label: "Conteúdo · calendário", when: "ter e qui 09:00" },
    ],
  },
];

export const diretoria = { id: "diretoria", name: "Cobertura · Diretoria", departmentId: "diretoria" };

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
  {
    id: "gui",
    name: "Gui",
    role: "Dev",
    initials: "GU",
    companyId: "domma",
    departmentId: "produto",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "PR #142",
    budget: { spent: 48, cap: 100 },
    figurinha: fig("mostarda", "larga", "codigo", "parafuso"),
    hired: true,
  },
  {
    id: "ze",
    name: "Zé",
    role: "QA",
    initials: "ZÉ",
    companyId: "domma",
    departmentId: "produto",
    provider: "ChatGPT",
    model: "GPT-5 mini",
    reserve: "Claude · Haiku",
    status: "trabalhando",
    activity: "testando PR #142",
    budget: { spent: 21, cap: 60 },
    figurinha: fig("mostarda", "redonda", "oculos", "antena"),
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
    budget: { spent: 39, cap: 90 },
    figurinha: fig("petroleo", "arredondada", "pontos", "fone"),
    hired: true,
  },
  {
    id: "noa",
    name: "Noa",
    role: "Vendas",
    initials: "NO",
    companyId: "domma",
    departmentId: "vendas",
    provider: "Gemini",
    model: "Gemini 2.5 Pro",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "2 demos marcadas",
    budget: { spent: 44, cap: 80 },
    figurinha: fig("verde", "redonda", "felizes", "bone"),
    hired: true,
  },
  {
    id: "pri",
    name: "Pri",
    role: "Pré-vendas",
    initials: "PR",
    companyId: "domma",
    departmentId: "vendas",
    provider: "Claude",
    model: "Claude Haiku",
    reserve: "ChatGPT · GPT-5 mini",
    status: "ocioso",
    activity: "ociosa",
    budget: { spent: 30, cap: 50 },
    figurinha: fig("verde", "arredondada", "brilhantes", "estrela"),
    hired: true,
  },
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
    activity: "otimizando Auto Visão",
    budget: { spent: 71, cap: 90 },
    figurinha: fig("laranja", "quadrada", "grafico", "antena", "reto"),
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
    figurinha: fig("laranja", "redonda", "visor", "chifres", "bravo"),
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
    activity: "4 anúncios da Auto Visão",
    budget: { spent: 52, cap: 80 },
    figurinha: fig("roxo", "alta", "brilhantes", "lapis", "reto"),
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
    budget: { spent: 58, cap: 80 },
    figurinha: fig("roxo", "arredondada", "brilhantes", "gorro"),
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
    figurinha: fig("ciano", "quadrada", "pontos", "fone"),
    hired: true,
  },
  {
    id: "bia",
    name: "Bia",
    role: "SDR Lojas",
    initials: "BI",
    companyId: "master-laudo",
    departmentId: "comercial",
    provider: "ChatGPT",
    model: "GPT-5",
    reserve: "Claude · Sonnet",
    status: "trabalhando",
    activity: "3 leads qualificados",
    budget: { spent: 54, cap: 80 },
    figurinha: fig("verde", "redonda", "pontos", "fone"),
    hired: true,
  },
  {
    id: "teo",
    name: "Téo",
    role: "Franquias",
    initials: "TÉ",
    companyId: "master-laudo",
    departmentId: "comercial",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "esperando",
    activity: "precisa da sua aprovação",
    budget: { spent: 38, cap: 80 },
    figurinha: fig("verde", "quadrada", "visor", "topete", "reto"),
    hired: true,
  },
  {
    id: "nina",
    name: "Nina",
    role: "Suporte N1",
    initials: "NI",
    companyId: "master-laudo",
    departmentId: "suporte-lojas",
    provider: "ChatGPT",
    model: "GPT-5 mini",
    reserve: "Claude · Haiku",
    status: "trabalhando",
    activity: "2 chamados",
    budget: { spent: 41, cap: 60 },
    figurinha: fig("petroleo", "redonda", "felizes", "fone"),
    hired: true,
  },
  {
    id: "davi",
    name: "Davi",
    role: "Suporte N2",
    initials: "DA",
    companyId: "master-laudo",
    departmentId: "suporte-lojas",
    provider: "Claude",
    model: "Claude Sonnet",
    reserve: "ChatGPT · GPT-5",
    status: "trabalhando",
    activity: "laudos e Portaria 01524",
    budget: { spent: 33, cap: 60 },
    figurinha: fig("petroleo", "quadrada", "oculos", "gorro", "reto"),
    hired: true,
  },
  {
    id: "lia",
    name: "Lia",
    role: "Conteúdo",
    initials: "LI",
    companyId: "master-laudo",
    departmentId: "marketing",
    provider: "Claude",
    model: "Claude Haiku",
    reserve: "ChatGPT · GPT-5 mini",
    status: "ocioso",
    activity: "ociosa",
    budget: { spent: 12, cap: 40 },
    figurinha: fig("rosa", "redonda", "pontos", "estrela"),
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
    figurinha: fig("laranja", "arredondada", "felizes", "bone"),
    hired: false,
  },
];

export const figurinhaOrder = ["otavio", "tavinho", "bia", "teo", "nina", "davi", "lia", "max", "rui", "duda", "gui", "ze"];

export const approvals: Approval[] = [
  {
    id: "ap-teo",
    botId: "teo",
    kind: "mensagem",
    context: "Master Laudo IA",
    ago: "há 2 min",
    tag: "regra: mais de 10 contatos",
    text: "Quer enviar a proposta de franquia por WhatsApp para **12 leads** do Goalfy e oferecer 3 horários de reunião com você a cada um.",
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
      text: "Enviar a proposta por WhatsApp para **12 leads** com a mensagem abaixo e oferecer 3 horários de reunião a cada um.",
      preview:
        "Olá, {nome}! Aqui é da Master Laudo. Vi seu interesse em abrir uma franquia em {cidade}. Segue nossa proposta em PDF. Podemos conversar 20 minutos essa semana? Tenho {horário 1}, {horário 2} ou {horário 3}.",
    },
  },
  {
    id: "ap-vini",
    botId: "tavinho",
    kind: "contratar",
    context: "RedBox IA",
    ago: "há 25 min",
    tag: "contratar bot",
    hireBotId: "vini",
    text: "Propõe contratar **“Vini · Tráfego TikTok”** (ChatGPT, R$ 60/mês) na RedBox IA: dois clientes pediram TikTok Ads e o Max e o Rui já estão no limite.",
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
    context: "RedBox IA",
    ago: "há 41 min",
    tag: "gasto acima do teto",
    text: "Quer subir o orçamento diário da campanha **Auto Visão · Vistoria BH** de R$ 80 para R$ 120: CPA caiu 32% nos últimos 7 dias.",
    chips: ["conta Google Ads · Auto Visão", "+R$ 1.200/mês do cliente", "ver análise"],
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
  { id: "au-2", time: "15:31", bot: "Téo", action: "goalfy.listar_contatos", result: "permitido", tone: "ok" },
  { id: "au-3", time: "15:29", bot: "Otávio", action: "browser.abrir canva.com", result: "parou no 2FA", tone: "block" },
  { id: "au-4", time: "15:12", bot: "Duda", action: "arquivo.gravar anuncios-auto-visao.md", result: "permitido", tone: "ok" },
  { id: "au-5", time: "14:58", bot: "Lia", action: "browser.abrir instagram.com", result: "negado · site fora da lista", tone: "deny" },
  { id: "au-6", time: "14:40", bot: "Nina", action: "asaas.consultar_cobranca", result: "permitido", tone: "ok" },
];

export const feed: FeedItem[] = [
  {
    id: "f-1",
    tone: "wait",
    title: "**Franquias** quer enviar proposta a 12 leads",
    meta: "Master Laudo IA · há 2 min",
    action: { label: "aprovar", to: "/conselho" },
  },
  {
    id: "f-2",
    tone: "block",
    title: "**Design** travou no login do Canva (2FA)",
    meta: "RedBox IA · há 6 min",
    action: { label: "assumir", to: "/computador/otavio" },
  },
  {
    id: "f-3",
    tone: "ok",
    title: "**Copy** entregou 4 anúncios para Auto Visão",
    meta: "RedBox IA · há 11 min",
    action: { label: "ver", to: "/chat/duda" },
  },
  {
    id: "f-4",
    tone: "ok",
    title: "**Conteúdo** pediu um anúncio à RedBox IA (subiu de elevador)",
    meta: "Master Laudo IA → RedBox IA · há 14 min",
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
    title: "Téo · Franquias",
    subtitle: "Comercial · Master Laudo IA",
    section: "master-laudo",
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
        "Franquias, pega os leads de franquia que chegaram no Goalfy essa semana, manda a proposta padrão e agenda reunião comigo pra quem responder.",
        { audio: "0:14" },
      ),
      m(
        "teo-2",
        "bot",
        "Franquias · Claude",
        "FR",
        "15:31",
        "Fechado. Encontrei **12 leads** marcados como \"Franquia\" no Goalfy desde segunda (8 de Google Ads, 4 de Meta Ads). Vou usar a proposta *Franquia Master Laudo 2026* do Drive e a agenda de alinhamento.",
        {
          tools: [
            'goalfy.listar_contatos(tag="Franquia", desde="2026-11-02") → 12',
            'drive.ler("Proposta Franquia 2026.pdf")',
            "agenda.horarios_livres(otavio, 7 dias) → 9 janelas",
          ],
        },
      ),
      m("teo-3", "bot", "Franquias", "FR", "15:33", "", { approvalId: "ap-teo" }),
      m(
        "teo-4",
        "outro",
        "Tavinho (CEO-bot)",
        "TV",
        "15:34",
        "Lembrete: a RedBox IA entregou 4 anúncios hoje. Se quiser, o Conteúdo pode aproveitar a mesma campanha para franquias. [Pedir ao Conteúdo]",
      ),
    ],
  },
  {
    id: "otavio",
    kind: "bot",
    botId: "otavio",
    title: "Otávio · Designer",
    subtitle: "Criação · RedBox IA",
    section: "redbox",
    time: "15:29",
    preview: "Travei no 2FA do Canva, preciso de você",
    unread: 1,
    messages: [
      m("ot-1", "voce", "Você", "OM", "15:20", "Otávio, monta as 4 variações da Auto Visão no Canva com a paleta nova."),
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
    subtitle: "Criação · RedBox IA",
    section: "redbox",
    time: "15:12",
    preview: "Os 4 anúncios da Auto Visão estão prontos",
    unread: 3,
    messages: [
      m("du-1", "voce", "Você", "OM", "14:50", "Duda, escreve 4 anúncios para a Auto Visão, foco em vistoria rápida em BH."),
      m("du-2", "bot", "Duda · Claude", "DU", "15:10", "Escrevi os 4 anúncios com 3 títulos cada. Salvei em anuncios-auto-visao.md.", {
        tools: ["arquivo.gravar anuncios-auto-visao.md"],
      }),
      m("du-3", "bot", "Duda · Claude", "DU", "15:11", "O título que mais gostei: **Vistoria em 20 minutos, sem fila.**"),
      m("du-4", "bot", "Duda · Claude", "DU", "15:12", "Já mandei para o Otávio montar as peças."),
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
      m("sd-2", "outro", "Tavinho (CEO-bot)", "TV", "14:21", "Master Laudo: 12 leads de franquia. RedBox: 4 anúncios e 2 campanhas otimizadas. Domma: PR #142 em revisão."),
      m("sd-3", "outro", "Max · Google Ads", "MA", "14:30", "Complemento: o CPA da Auto Visão caiu 32% em 7 dias."),
    ],
  },
  {
    id: "bia",
    kind: "bot",
    botId: "bia",
    title: "Bia · SDR Lojas",
    subtitle: "Comercial · Master Laudo IA",
    section: "master-laudo",
    time: "15:05",
    preview: "ChatGPT · 3 leads qualificados",
    unread: 0,
    messages: [
      m("bi-1", "bot", "Bia · ChatGPT", "BI", "15:05", "Qualifiquei **3 leads** de lojas novas em Contagem e Betim. Todos querem reunião esta semana.", {
        tools: ["goalfy.atualizar_lead × 3"],
      }),
    ],
  },
  {
    id: "nina",
    kind: "bot",
    botId: "nina",
    title: "Nina · Suporte N1",
    subtitle: "Suporte às lojas · Master Laudo IA",
    section: "master-laudo",
    time: "14:40",
    preview: "ChatGPT · 2 chamados",
    unread: 0,
    messages: [
      m("ni-1", "bot", "Nina · ChatGPT", "NI", "14:40", "Dois chamados abertos: a loja de Uberaba não vê a pesquisa liberada e a de Juiz de Fora pediu segunda via do boleto.", {
        tools: ["asaas.consultar_cobranca(loja=uberaba)"],
      }),
    ],
  },
  {
    id: "lia",
    kind: "bot",
    botId: "lia",
    title: "Lia · Conteúdo",
    subtitle: "Marketing · Master Laudo IA",
    section: "master-laudo",
    time: "14:58",
    preview: "Claude · ociosa",
    unread: 0,
    messages: [
      m("li-1", "bot", "Lia · Claude", "LI", "14:58", "Tentei abrir o Instagram para ver as referências, mas o site está fora da minha lista. Fico no aguardo."),
    ],
  },
  {
    id: "max",
    kind: "bot",
    botId: "max",
    title: "Max · Google Ads",
    subtitle: "Tráfego pago · RedBox IA",
    section: "redbox",
    time: "14:52",
    preview: "ChatGPT · otimizando Auto Visão",
    unread: 0,
    messages: [
      m("ma-1", "bot", "Max · ChatGPT", "MA", "14:52", "O CPA da **Auto Visão · Vistoria BH** caiu 32% em 7 dias. Pedi ao conselho para subir o orçamento diário para R$ 120."),
    ],
  },
  {
    id: "gui",
    kind: "bot",
    botId: "gui",
    title: "Gui · Dev",
    subtitle: "Produto · Domma IA",
    section: "domma",
    time: "13:47",
    preview: "Claude · PR #142",
    unread: 0,
    messages: [
      m("gu-1", "bot", "Gui · Claude", "GU", "13:47", "Abri o **PR #142** com o novo fluxo de agendamento do Domma Chat. O Zé já está testando.", {
        tools: ["github.criar_pr(domma-chat, #142)"],
      }),
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
      subtitle: company ? `${company.departments.find((d) => d.id === b.departmentId)?.name ?? ""} · ${company.name}` : "Cobertura · Diretoria",
      section: (b.companyId === "diretoria" ? "salas" : b.companyId) as Conversation["section"],
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
      "$ ls ~/trabalho/auto-visao",
      "briefing-anuncios.md   paleta-redbox.json   logo-auto-visao.svg",
      "$ python gerar_variacoes.py --briefing briefing-anuncios.md --saida ./variacoes",
      "[ok] 4 variações geradas em ./variacoes (1080x1080, 1080x1920)",
      "$ open https://www.canva.com/login",
      "[gateway] navegação permitida (regra: dominio canva.com, bot Design)",
      "[gateway] campo de 2FA detectado → pedindo ajuda humana, bot em espera",
    ],
    files: [
      { name: "auto-visao/", depth: 0, kind: "folder" },
      { name: "briefing-anuncios.md", depth: 1, kind: "file" },
      { name: "paleta-redbox.json", depth: 1, kind: "file" },
      { name: "variacoes/", depth: 1, kind: "folder", note: "4 arquivos" },
      { name: "royal-vistorias/", depth: 0, kind: "folder" },
      { name: "compartilhado/", depth: 0, kind: "shared", note: "RedBox IA" },
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
      { text: "Gerou 4 variações da Auto Visão", tone: "ok" },
      { text: "Abriu o Canva (login próprio do bot)", tone: "ok" },
      { text: "Parou no código de 2FA", tone: "block" },
    ],
    blockedNote:
      "**O bot parou aqui.** Pela política, bots nunca digitam códigos 2FA. Clique em **Assumir controle**, digite o código e devolva. Enquanto você controla, o bot fica em espera.",
  },
  teo: {
    url: "app.goalfy.com.br/contatos?tag=franquia",
    profile: "perfil: franquias@masterlaudo · só este bot",
    container: "Claude Sonnet (sua assinatura) · container Docker `ml-franquias` · Ubuntu 24.04 · Chromium com perfil próprio · 1,4 GB em uso",
    tabs: ["Tela ao vivo", "Terminal", "Arquivos", "Logins do bot", "Auditoria"],
    terminal: [
      "$ goalfy contatos --tag Franquia --desde 2026-11-02",
      "12 contatos encontrados (8 Google Ads, 4 Meta Ads)",
      "$ drive baixar \"Proposta Franquia 2026.pdf\" ~/propostas/",
      "[ok] 2,3 MB salvos",
      "[gateway] whatsapp.enviar × 12 → regra: mais de 10 contatos, aguardando conselho",
    ],
    files: [
      { name: "propostas/", depth: 0, kind: "folder" },
      { name: "Proposta Franquia 2026.pdf", depth: 1, kind: "file" },
      { name: "leads-semana.csv", depth: 1, kind: "file" },
      { name: "compartilhado/", depth: 0, kind: "shared", note: "Master Laudo IA" },
    ],
    logins: [
      { site: "Goalfy", account: "franquias@masterlaudo", ok: true },
      { site: "WhatsApp", account: "Master Laudo", ok: true },
      { site: "Google Drive", account: "OAuth · Master Laudo", ok: true },
    ],
    policies: [
      "Sites permitidos: goalfy.com.br, drive.google.com, calendar.google.com",
      "Mensagens para mais de 10 contatos: pedir aprovação",
      "Nunca falar de preço de franquia antes da reunião",
    ],
    resources: { cpu: 9, memory: "0,9 / 4 GB", memoryPct: 22, tokens: "R$ 2,10", tokensPct: 26 },
    recent: [
      { text: "Abriu o Goalfy (login próprio do bot)", tone: "ok" },
      { text: "Baixou a proposta do Drive para ~/propostas/", tone: "ok" },
      { text: "Aguardando aprovação para enviar 12 mensagens", tone: "wait" },
    ],
  },
};

export const botMemory: Record<string, string> = {
  teo: "Proposta padrão: *Franquia Master Laudo 2026*. Reuniões de alinhamento duram 20 min. Leads de MG têm prioridade. Não falar de preço antes da reunião.",
  otavio: "Paleta da Auto Visão: azul #1d4ed8 e amarelo #facc15. Sempre 3 variações. O cliente prefere fotos reais a ilustrações.",
};

export const botSkills: Record<string, string[]> = {
  teo: ["Goalfy", "WhatsApp", "Google Drive", "Agenda", "skill: proposta-franquia"],
  otavio: ["Canva", "Google Drive", "skill: frontend-design"],
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
  { id: "sk-1", name: "proposta-franquia", source: "sua · criada pelo Téo a partir de uma tarefa · v4", kind: "propria", bots: ["teo"], state: "ativa" },
  { id: "sk-2", name: "relatorio-semanal-ads", source: "gravada por você (Teach-a-task, 6 min) · roda seg 08:00", kind: "gravada", bots: ["max", "rui"], state: "ativa" },
  { id: "sk-3", name: "docx · xlsx · pdf", source: "anthropics/skills · 3 skills · **atualização disponível**", kind: "github", bots: ["bia", "nina", "lia"], state: "atualizar" },
  { id: "sk-4", name: "frontend-design", source: "anthropics/skills · v2.1", kind: "github", bots: ["otavio", "gui"], state: "ativa" },
  { id: "sk-5", name: "laudo-portaria-01524", source: "sua · Anexo II e III · v2", kind: "propria", bots: ["davi"], state: "ativa" },
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
  { id: "mcp-1", name: "goalfy", transport: "remoto", detail: "12 ferramentas · contatos, tags, fontes de lead", ok: true, bots: ["bia", "teo", "tavinho"] },
  { id: "mcp-2", name: "asaas", transport: "remoto", detail: "cobranças e assinaturas · só Master Laudo IA", ok: true, bots: ["nina"] },
  { id: "mcp-3", name: "google-ads · meta-ads", transport: "remoto", detail: "campanhas, métricas, orçamentos · só RedBox IA", ok: true, bots: ["max", "rui"] },
  { id: "mcp-4", name: "supabase", transport: "remoto", detail: "banco dos sistemas Domma", ok: true, bots: ["gui", "ze"] },
  { id: "mcp-5", name: "filesystem", transport: "stdio", detail: "npx @modelcontextprotocol/server-filesystem ~/trabalho", ok: true, bots: ["todos"] },
  { id: "mcp-6", name: "whatsapp-oficial", transport: "remoto", detail: "", ok: false, bots: ["bia", "teo"], warning: "token expirado" },
];

export const connectedApps: { name: string; state: "ok" | "atencao" | "off" }[] = [
  { name: "Gmail", state: "ok" },
  { name: "Google Agenda", state: "ok" },
  { name: "Google Drive", state: "ok" },
  { name: "WhatsApp (QR)", state: "ok" },
  { name: "GitHub", state: "ok" },
  { name: "Canva", state: "atencao" },
  { name: "iFood", state: "off" },
  { name: "Mercado Pago", state: "off" },
  { name: "Notion", state: "off" },
];

export const modelKeys: { name: string; detail: string; ok: boolean; action?: string }[] = [
  { name: "Claude Code", detail: "assinatura · logado · usado por 6 bots", ok: true },
  { name: "Codex (ChatGPT)", detail: "assinatura · logado · usado por 6 bots", ok: true },
  { name: "xAI (Grok)", detail: "chave de API · criptografada · 1 bot", ok: true },
  { name: "Gemini", detail: "chave de API · 1 bot", ok: true },
  { name: "OpenRouter · Ollama local", detail: "não configurado", ok: false, action: "adicionar" },
];

export const councilRules = [
  "Contratar ou demitir bot",
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
  { scope: "Master Laudo IA", rule: "whatsapp.enviar com mais de 10 contatos", effect: "pedir aprovação" },
  { scope: "RedBox IA", rule: "google-ads.orcamento acima do teto", effect: "pedir aprovação" },
  { scope: "Otávio · Designer", rule: "browser: canva.com, drive.google.com, business.facebook.com", effect: "permitir" },
  { scope: "Lia · Conteúdo", rule: "browser: instagram.com", effect: "negar (fora da lista)" },
];

export const weeklySummary =
  "48 tarefas concluídas nas 3 empresas, R$ 733 gastos (49% do teto). Destaques: 11 leads de franquia qualificados, 4 campanhas otimizadas, PR #142 aprovado. Para segunda, proponho priorizar a campanha de franquias e contratar o Vini.";

export const totalBudget = { spent: 733, cap: 1500 };

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
