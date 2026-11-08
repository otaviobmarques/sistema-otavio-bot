import { createContext, useCallback, useContext, useMemo, useReducer, type ReactNode } from "react";
import * as mock from "../data/mock";
import type { Approval, AuditEntry, AuditTone, Bot, Conversation, Message, Skill } from "../data/mock";

export interface Toast {
  id: number;
  text: string;
}

export interface PortalState {
  bots: Bot[];
  approvals: Approval[];
  audit: AuditEntry[];
  conversations: Conversation[];
  skills: Skill[];
  /** id do bot cujo computador você controla agora */
  controlling: string | null;
  /** relógio fictício, em minutos desde meia-noite */
  clock: number;
  /** resultado das aprovações já decididas, por id */
  decided: Record<string, { label: string; outcome: "aprovado" | "recusado" }>;
  toasts: Toast[];
  nextId: number;
}

const initialState: PortalState = {
  bots: mock.bots,
  approvals: mock.approvals,
  audit: mock.audit,
  conversations: mock.conversations,
  skills: mock.skills,
  controlling: null,
  clock: 15 * 60 + 35,
  decided: {},
  toasts: [],
  nextId: 1,
};

export interface HireDraft {
  name: string;
  role: string;
  companyId: string;
  departmentId: string;
  provider: Bot["provider"];
  model: string;
  reserve: string;
  cap: number;
  figurinha: Bot["figurinha"];
  personality: string;
}

type Action =
  | { type: "decide"; approvalId: string; optionIndex: number }
  | { type: "takeControl"; botId: string }
  | { type: "releaseControl"; botId: string }
  | { type: "openConversation"; id: string }
  | { type: "send"; conversationId: string; text: string }
  | { type: "hire"; draft: HireDraft }
  | { type: "installSkill"; skill: Omit<Skill, "id"> }
  | { type: "updateSkill"; id: string }
  | { type: "dismissToast"; id: number }
  | { type: "toast"; text: string };

export const formatClock = (minutes: number) => {
  const h = Math.floor(minutes / 60) % 24;
  const mm = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
};

function withAudit(state: PortalState, bot: string, action: string, result: string, tone: AuditTone): PortalState {
  const clock = state.clock + 1;
  const entry: AuditEntry = { id: `au-n${state.nextId}`, time: formatClock(clock), bot, action, result, tone };
  return { ...state, clock, audit: [entry, ...state.audit], nextId: state.nextId + 1 };
}

function withToast(state: PortalState, text: string): PortalState {
  return { ...state, toasts: [...state.toasts, { id: state.nextId, text }], nextId: state.nextId + 1 };
}

function setBot(state: PortalState, botId: string, patch: Partial<Bot>): PortalState {
  return { ...state, bots: state.bots.map((b) => (b.id === botId ? { ...b, ...patch } : b)) };
}

function appendMessage(state: PortalState, conversationId: string, msg: Omit<Message, "id">): PortalState {
  const id = `msg-n${state.nextId}`;
  return {
    ...state,
    nextId: state.nextId + 1,
    conversations: state.conversations.map((c) =>
      c.id === conversationId
        ? { ...c, hidden: false, messages: [...c.messages, { ...msg, id }], time: msg.time, preview: msg.text.replace(/\*\*/g, "") }
        : c,
    ),
  };
}

function reducer(state: PortalState, action: Action): PortalState {
  switch (action.type) {
    case "decide": {
      const ap = state.approvals.find((a) => a.id === action.approvalId);
      const opt = ap?.options[action.optionIndex];
      if (!ap || !opt) return state;
      const bot = state.bots.find((b) => b.id === ap.botId);
      const botName = bot?.name ?? "bot";
      if (opt.outcome === "adiado") {
        let next = withAudit(state, botName, ap.action, opt.result, "wait");
        next = { ...next, approvals: [...next.approvals.filter((a) => a.id !== ap.id), ap] };
        return withToast(next, `${opt.label}: o pedido continua no conselho.`);
      }
      const approved = opt.outcome === "aprovado";
      let next = withAudit(state, botName, ap.action, opt.result, approved ? "ok" : "deny");
      next = {
        ...next,
        approvals: next.approvals.filter((a) => a.id !== ap.id),
        decided: { ...next.decided, [ap.id]: { label: opt.label, outcome: opt.outcome } },
        audit: next.audit.map((e) =>
          e.tone === "wait" && e.action === ap.action ? { ...e, result: approved ? "permitido" : "recusado", tone: approved ? "ok" : "deny" } : e,
        ),
      };
      if (bot && bot.status === "esperando") next = setBot(next, bot.id, { status: "trabalhando", activity: approved ? "executando o que você aprovou" : "pedido recusado" });
      if (ap.kind === "contratar" && ap.hireBotId) {
        next = approved
          ? setBot(next, ap.hireBotId, { hired: true, status: "trabalhando", activity: "primeiro dia" })
          : { ...next, bots: next.bots.filter((b) => b.id !== ap.hireBotId) };
      }
      const conv = next.conversations.find((c) => c.messages.some((msg) => msg.approvalId === ap.id));
      if (conv && bot) {
        next = appendMessage(next, conv.id, {
          from: "bot",
          author: `${bot.role} · ${bot.provider}`,
          authorInitials: bot.initials,
          time: formatClock(next.clock),
          text: approved ? `Combinado. ${opt.label}: vou executar agora e te aviso quando terminar.` : "Entendido, não vou enviar. Se quiser, me diga o que ajustar.",
        });
      }
      return withToast(next, approved ? `Aprovado: ${opt.label}.` : "Pedido recusado e registrado na auditoria.");
    }
    case "takeControl": {
      const bot = state.bots.find((b) => b.id === action.botId);
      const next = withAudit({ ...state, controlling: action.botId }, bot?.name ?? "bot", "humano.assumir_controle", "você no controle", "wait");
      return next;
    }
    case "releaseControl": {
      const bot = state.bots.find((b) => b.id === action.botId);
      let next = withAudit({ ...state, controlling: null }, bot?.name ?? "bot", "humano.devolver_controle", "2FA concluído por você", "ok");
      next = setBot(next, action.botId, { status: "trabalhando", activity: "voltou a trabalhar" });
      next = { ...next, conversations: next.conversations.map((c) => (c.botId === action.botId ? { ...c, preview: "Obrigado, voltei a trabalhar." } : c)) };
      return withToast(next, `${bot?.name ?? "O bot"} voltou a trabalhar.`);
    }
    case "openConversation":
      return {
        ...state,
        conversations: state.conversations.map((c) => (c.id === action.id && c.unread > 0 ? { ...c, unread: 0 } : c)),
      };
    case "send": {
      const conv = state.conversations.find((c) => c.id === action.conversationId);
      if (!conv || !action.text.trim()) return state;
      const clock = state.clock + 1;
      let next = appendMessage({ ...state, clock }, conv.id, {
        from: "voce",
        author: "Você",
        authorInitials: "OM",
        time: formatClock(clock),
        text: action.text.trim(),
      });
      const bot = next.bots.find((b) => b.id === conv.botId);
      next = appendMessage(next, conv.id, {
        from: conv.kind === "sala" ? "outro" : "bot",
        author: bot ? `${bot.role} · ${bot.provider}` : "Tavinho (CEO-bot)",
        authorInitials: bot?.initials ?? "TV",
        time: formatClock(clock),
        text: "Recebido. Esta é uma resposta de exemplo: no protótipo nenhum bot de verdade está conectado.",
      });
      return next;
    }
    case "hire": {
      const d = action.draft;
      const id = `novo-${state.nextId}`;
      const initials = d.name.slice(0, 2).toUpperCase() || "NB";
      const bot: Bot = {
        id,
        name: d.name || "Novo bot",
        role: d.role || "Função",
        initials,
        companyId: d.companyId,
        departmentId: d.departmentId,
        provider: d.provider,
        model: d.model,
        reserve: d.reserve,
        status: "esperando",
        activity: "na recepção, aguardando o conselho",
        budget: { spent: 0, cap: d.cap },
        figurinha: d.figurinha,
        hired: false,
        personality: d.personality,
      };
      const company = mock.companies.find((c) => c.id === d.companyId);
      const dept = company?.departments.find((x) => x.id === d.departmentId);
      const approval: Approval = {
        id: `ap-${id}`,
        botId: id,
        kind: "contratar",
        context: company?.name ?? "",
        ago: "agora",
        tag: "contratar bot",
        text: `Você pediu para contratar **“${bot.name} · ${bot.role}”** (${d.provider} · ${d.model}, até R$ ${d.cap}/mês) em ${company?.name ?? "uma empresa"}.`,
        chips: [`reporta a: ${dept?.name ?? "Diretor"}`, `IA reserva: ${d.reserve}`, "computador próprio"],
        action: `conselho.contratar ${bot.name}`,
        options: [
          { label: "Aprovar contratação", tone: "primary", result: "contratação aprovada", outcome: "aprovado" },
          { label: "Depois", tone: "secondary", result: "adiado", outcome: "adiado" },
          { label: "Recusar", tone: "danger", result: "contratação recusada", outcome: "recusado" },
        ],
        hireBotId: id,
      };
      let next: PortalState = { ...state, bots: [...state.bots, bot], approvals: [approval, ...state.approvals], nextId: state.nextId + 1 };
      next = withAudit(next, "Você", `conselho.pedir_contratacao ${bot.name}`, "aguardando", "wait");
      return withToast(next, `${bot.name} chegou na recepção. A contratação está esperando você no conselho.`);
    }
    case "installSkill": {
      const next = { ...state, skills: [{ ...action.skill, id: `sk-n${state.nextId}` }, ...state.skills], nextId: state.nextId + 1 };
      return withToast(withAudit(next, "Você", `skill.instalar ${action.skill.name}`, "permitido", "ok"), `Skill ${action.skill.name} instalada.`);
    }
    case "updateSkill":
      return withToast(
        { ...state, skills: state.skills.map((s) => (s.id === action.id ? { ...s, state: "ativa", source: s.source.replace(" · **atualização disponível**", " · atualizada agora") } : s)) },
        "Skill atualizada.",
      );
    case "toast":
      return withToast(state, action.text);
    case "dismissToast":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
  }
}

interface PortalApi {
  state: PortalState;
  decide: (approvalId: string, optionIndex: number) => void;
  takeControl: (botId: string) => void;
  releaseControl: (botId: string) => void;
  openConversation: (id: string) => void;
  send: (conversationId: string, text: string) => void;
  hire: (draft: HireDraft) => void;
  installSkill: (skill: Omit<Skill, "id">) => void;
  updateSkill: (id: string) => void;
  toast: (text: string) => void;
  dismissToast: (id: number) => void;
}

const Ctx = createContext<PortalApi | null>(null);

export function PortalProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const decide = useCallback((approvalId: string, optionIndex: number) => dispatch({ type: "decide", approvalId, optionIndex }), []);
  const takeControl = useCallback((botId: string) => dispatch({ type: "takeControl", botId }), []);
  const releaseControl = useCallback((botId: string) => dispatch({ type: "releaseControl", botId }), []);
  const openConversation = useCallback((id: string) => dispatch({ type: "openConversation", id }), []);
  const send = useCallback((conversationId: string, text: string) => dispatch({ type: "send", conversationId, text }), []);
  const hire = useCallback((draft: HireDraft) => dispatch({ type: "hire", draft }), []);
  const installSkill = useCallback((skill: Omit<Skill, "id">) => dispatch({ type: "installSkill", skill }), []);
  const updateSkill = useCallback((id: string) => dispatch({ type: "updateSkill", id }), []);
  const toast = useCallback((text: string) => dispatch({ type: "toast", text }), []);
  const dismissToast = useCallback((id: number) => dispatch({ type: "dismissToast", id }), []);
  const api = useMemo(
    () => ({ state, decide, takeControl, releaseControl, openConversation, send, hire, installSkill, updateSkill, toast, dismissToast }),
    [state, decide, takeControl, releaseControl, openConversation, send, hire, installSkill, updateSkill, toast, dismissToast],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function usePortal(): PortalApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("usePortal fora do PortalProvider");
  return v;
}

export function useCounts() {
  const { state } = usePortal();
  return useMemo(() => {
    const active = state.bots.filter((b) => b.hired);
    const working = active.filter((b) => b.status === "trabalhando").length;
    const waiting = active.filter((b) => b.status === "esperando").length;
    const blocked = active.filter((b) => b.status === "bloqueado").length;
    const unread = state.conversations.reduce((n, c) => n + c.unread, 0);
    return { total: active.length, working, waiting, blocked, approvals: state.approvals.length, unread };
  }, [state.bots, state.approvals, state.conversations]);
}

export function useBot(id: string | undefined): Bot | undefined {
  const { state } = usePortal();
  return state.bots.find((b) => b.id === id);
}
