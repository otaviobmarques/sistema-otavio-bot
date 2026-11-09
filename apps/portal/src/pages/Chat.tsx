import { ChevronLeft, Mic, Monitor, Paperclip, Plus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import type { Bot, Conversation, Message } from "../data/mock";
import { ApprovalInline } from "../components/ApprovalInline";
import { Figurinha } from "../components/Figurinha";
import { Dot, InitialsTile, Rich, useIsMobile } from "../components/ui";
import { computerFor, memoryFor, skillsFor } from "../lib/computer";
import { statusColor, toneColor } from "../lib/colors";
import { statusLabel } from "../data/mock";
import { usePortal } from "../state/store";

const sectionTitle: Record<Conversation["section"], string> = {
  salas: "Salas",
  redbox: "RedBox",
  vertice: "Vertice",
  domma: "Domma Tecnologia",
  foodx: "FoodX",
};

function useChatLists(query: string) {
  const { state } = usePortal();
  return useMemo(() => {
    const pendingIds = new Set(state.approvals.map((a) => a.id));
    const botById = new Map(state.bots.map((b) => [b.id, b]));
    const q = query.trim().toLowerCase();
    const visible = state.conversations.filter((c) => !c.hidden && (!q || c.title.toLowerCase().includes(q)));
    const tone = (c: Conversation): "wait" | "block" | "ok" | null => {
      const bot = c.botId ? botById.get(c.botId) : undefined;
      if (c.messages.some((m) => m.approvalId && pendingIds.has(m.approvalId))) return "wait";
      if (bot?.status === "bloqueado") return "block";
      if (c.unread > 0) return "ok";
      return null;
    };
    const highlighted = visible.filter((c) => tone(c) !== null).sort((a, b) => b.time.localeCompare(a.time));
    const rest = visible.filter((c) => tone(c) === null);
    const sections = (["salas", "redbox", "vertice", "domma", "foodx"] as const)
      .map((s) => ({ id: s, title: sectionTitle[s], items: rest.filter((c) => c.section === s) }))
      .filter((s) => s.items.length > 0);
    return { highlighted, sections, tone };
  }, [state.approvals, state.bots, state.conversations, query]);
}

function avatarFor(c: Conversation, bot: Bot | undefined) {
  if (c.kind === "sala") {
    return (
      <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-tavinho/50 bg-tavinho/10 text-tavinho-soft">
        <Users size={16} />
      </span>
    );
  }
  return bot ? <InitialsTile bot={bot} size={36} /> : null;
}

function ConversationList({ activeId, onOpen }: { activeId?: string; onOpen: (id: string) => void }) {
  const { state } = usePortal();
  const [query, setQuery] = useState("");
  const { highlighted, sections, tone } = useChatLists(query);
  const botById = new Map(state.bots.map((b) => [b.id, b]));

  const row = (c: Conversation, showBadge: boolean) => {
    const bot = c.botId ? botById.get(c.botId) : undefined;
    const t = tone(c);
    const badgeColor = t === "wait" ? "#f59e0b" : t === "block" ? "#ef4444" : "#22c55e";
    return (
      <button
        key={c.id}
        onClick={() => onOpen(c.id)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition ${activeId === c.id ? "bg-ink-700" : "hover:bg-ink-750"}`}
      >
        {avatarFor(c, bot)}
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className="truncate text-[14px] font-semibold text-white">{c.title}</span>
            {showBadge && <span className="shrink-0 text-[11px] text-muted">{c.time}</span>}
          </span>
          <span className={`block truncate text-[12.5px] ${showBadge ? "text-soft" : "text-muted"}`}>{c.preview}</span>
        </span>
        {showBadge && (
          <span
            className="shrink-0 rounded-full px-2 text-[11px] font-bold leading-[20px] text-ink-900"
            style={{ background: badgeColor, minWidth: 22, textAlign: "center" }}
          >
            {c.unread > 0 ? c.unread : "!"}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="flex h-full flex-col">
      <div className="p-3">
        <input className="field bg-ink-800" placeholder="Buscar bot ou sala..." value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="flex-1 overflow-y-auto px-3 pb-3">
        {highlighted.length > 0 && (
          <>
            <div className="eyebrow mb-1 mt-1 px-1 text-tavinho-soft">Destaques · falaram com você</div>
            <div className="space-y-0.5">{highlighted.map((c) => row(c, true))}</div>
          </>
        )}
        {sections.map((s) => (
          <div key={s.id}>
            <div className="eyebrow mb-1 mt-4 px-1">{s.title}</div>
            <div className="space-y-0.5">{s.items.map((c) => row(c, false))}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-line p-3">
        <Link to="/contratar" className="btn w-full">
          <Plus size={15} /> Contratar bot
        </Link>
      </div>
    </div>
  );
}

function MessageRow({ m, compact }: { m: Message; compact?: boolean }) {
  const { toast } = usePortal();
  if (m.from === "voce") {
    return (
      <div className="flex justify-end gap-3">
        <div className={compact ? "max-w-[80%]" : "max-w-[78%]"}>
          <div className="mb-1 text-right text-[12px] text-muted">
            Você · {m.audio && compact ? `áudio ${m.audio}` : m.time}
          </div>
          <div className="rounded-2xl bg-ink-700 px-4 py-3 text-[14.5px] leading-relaxed text-white">
            <Rich text={m.text} />
          </div>
        </div>
        {!compact && (
          <span className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-tavinho text-[12px] font-bold text-white">{m.authorInitials}</span>
        )}
      </div>
    );
  }
  const body = m.approvalId ? (
    <ApprovalInline approvalId={m.approvalId} compact={compact} />
  ) : (
    <>
      {m.text && (
        <div className="rounded-xl border border-line bg-ink-800 px-4 py-3 text-[14.5px] leading-relaxed text-soft">
          <Rich text={m.text} onLink={(label) => toast(`${label}: pedido enviado (simulado).`)} />
        </div>
      )}
      {!compact && m.tools && (
        <div className="mt-2 space-y-1.5">
          {m.tools.map((t) => (
            <div key={t} className="flex items-center gap-2.5 rounded-md border border-line bg-ink-850 px-3 py-1.5 font-mono text-[12.5px] text-soft">
              <Dot color="#22c55e" size={7} /> {t}
            </div>
          ))}
        </div>
      )}
    </>
  );
  return (
    <div className="flex gap-3">
      {!compact && (
        <span className="mt-6 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-ink-750 text-[12px] font-semibold text-white">
          {m.authorInitials}
        </span>
      )}
      <div className={`min-w-0 ${m.approvalId ? (compact ? "w-full" : "max-w-[86%]") : compact ? "max-w-[82%]" : "flex-1"}`}>
        {!m.approvalId || !compact ? (
          <div className="mb-1 text-[12px] text-muted">
            {compact ? m.author.split(" · ")[0] : `${m.author} · ${m.time}`}
          </div>
        ) : null}
        {body}
      </div>
    </div>
  );
}

function Composer({ conversation, bot, compact }: { conversation: Conversation; bot?: Bot; compact?: boolean }) {
  const { send, toast } = usePortal();
  const [text, setText] = useState("");
  const submit = () => {
    if (!text.trim()) return;
    send(conversation.id, text);
    setText("");
  };
  const placeholder = compact
    ? `Mensagem para o ${bot?.name ?? "time"}...`
    : `Mensagem para ${bot?.role ?? conversation.title}... use @ para chamar outro bot`;
  return (
    <form
      className={compact ? "flex items-center gap-2 border-t border-line bg-ink-900 px-3 py-2.5" : "flex items-end gap-2.5 border-t border-line px-6 py-4"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        rows={compact ? 1 : 2}
        className="field flex-1 resize-none bg-ink-800"
        placeholder={placeholder}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      {!compact && (
        <button type="button" className="btn h-10 w-10 p-0" title="Anexar" onClick={() => toast("Anexos ficam para a próxima versão do protótipo.")}>
          <Paperclip size={16} />
        </button>
      )}
      <button
        type="button"
        className={`btn h-10 w-10 p-0 ${compact ? "btn-primary h-11 w-11" : ""}`}
        title="Falar"
        onClick={() => toast("Gravando áudio (simulado).")}
      >
        <Mic size={16} />
      </button>
      {!compact && (
        <button type="submit" className="btn btn-primary h-10">
          Enviar
        </button>
      )}
    </form>
  );
}

function ComputerPanel({ bot }: { bot: Bot }) {
  const pc = computerFor(bot);
  return (
    <aside className="overflow-y-auto border-l border-line px-5 py-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="eyebrow font-sans">Computador do {bot.name}</h2>
        <Link to={`/computador/${bot.id}`} className="chip hover:bg-ink-700">
          <Dot color={bot.status === "bloqueado" ? "#ef4444" : "#22c55e"} size={7} /> ao vivo
        </Link>
      </div>
      <Link to={`/computador/${bot.id}`} className="card block overflow-hidden hover:border-line-strong">
        <div className="flex items-center gap-3 border-b border-line px-3 py-2.5">
          <span className="flex gap-1">
            <Dot color="#ef4444" size={7} />
            <Dot color="#f59e0b" size={7} />
            <Dot color="#22c55e" size={7} />
          </span>
          <span className="truncate rounded bg-ink-900 px-2 py-1 font-mono text-[11px] text-muted">{pc.url}</span>
        </div>
        <div className="space-y-2 p-3">
          <div className="h-2.5 w-3/4 rounded bg-ink-700" />
          <div className="h-7 rounded border border-line bg-ink-850" />
          <div className="h-7 rounded border border-line bg-ink-850" />
          <div className={`h-7 rounded border ${bot.status === "bloqueado" ? "border-block/70 bg-block/10" : "border-tavinho bg-tavinho/10"}`} />
          <div className="h-7 rounded border border-line bg-ink-850" />
        </div>
      </Link>
      <div className="card mt-4 px-4 py-3.5">
        <div className="mb-2 text-[12.5px] text-muted">Atividade recente</div>
        <ul className="space-y-1.5 text-[13.5px] text-soft">
          {pc.recent.map((r) => (
            <li key={r.text} className="flex gap-2">
              <Dot color={toneColor[r.tone]} className="mt-[6px]" /> {r.text}
            </li>
          ))}
        </ul>
      </div>
      <div className="card mt-4 px-4 py-3.5">
        <div className="mb-2 text-[12.5px] text-muted">Memória do bot</div>
        <p className="text-[13.5px] leading-relaxed text-soft">
          <Rich text={memoryFor(bot)} />
        </p>
      </div>
      <div className="card mt-4 px-4 py-3.5">
        <div className="mb-2.5 text-[12.5px] text-muted">Skills e acessos</div>
        <div className="flex flex-wrap gap-2">
          {skillsFor(bot).map((s) => (
            <span key={s} className="chip px-3 py-1">
              {s}
            </span>
          ))}
        </div>
      </div>
    </aside>
  );
}

function useActiveConversation() {
  const { conversationId } = useParams();
  const { state, openConversation } = usePortal();
  const conv = state.conversations.find((c) => c.id === (conversationId ?? "teo"));
  useEffect(() => {
    if (conversationId) openConversation(conversationId);
  }, [conversationId, openConversation, conv?.messages.length]);
  return { conversationId, conv, bot: state.bots.find((b) => b.id === conv?.botId) };
}

function ScrollToEnd({ dep }: { dep: unknown }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    ref.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [dep]);
  return <div ref={ref} />;
}

export function ChatPage() {
  const mobile = useIsMobile();
  return mobile ? <ChatMobile /> : <ChatDesktop />;
}

function ChatDesktop() {
  const navigate = useNavigate();
  const { toast } = usePortal();
  const { conv, bot } = useActiveConversation();
  return (
    <div className="grid h-[calc(100vh-62px)] grid-cols-[292px_minmax(0,1fr)_358px]">
      <div className="border-r border-line">
        <ConversationList activeId={conv?.id} onOpen={(id) => navigate(`/chat/${id}`)} />
      </div>
      {conv ? (
        <section className="flex min-h-0 flex-col">
          <header className="flex items-center gap-3.5 border-b border-line px-6 py-3.5">
            {bot ? <InitialsTile bot={bot} size={42} /> : avatarFor(conv, undefined)}
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <span className="font-display text-[17px] font-semibold text-white">{conv.title}</span>
                <span className="text-[13px] text-muted"> · {conv.subtitle}</span>
              </div>
              <div className="text-[12.5px] leading-snug text-muted">
                {bot
                  ? `${bot.model}${bot.provider === "Claude" || bot.provider === "ChatGPT" ? " (sua assinatura)" : " (chave de API)"} · reserva: ${bot.reserve} · computador próprio · R$ ${bot.budget.spent} este mês`
                  : "Modo Auto: um modelo barato decide quem responde; o Tavinho é o líder"}
              </div>
            </div>
            {bot && (
              <Link to={`/computador/${bot.id}`} className="btn">
                <Monitor size={15} /> Ver computador
              </Link>
            )}
            <button className="btn" onClick={() => toast("Configurações do bot ficam na tela Contratar bot.")}>
              Configurar
            </button>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {conv.messages.length === 0 && <p className="py-16 text-center text-sm text-muted">Nenhuma mensagem ainda. Escreva para começar.</p>}
            {conv.messages.map((m) => (
              <MessageRow key={m.id} m={m} />
            ))}
            <ScrollToEnd dep={conv.messages.length} />
          </div>
          <Composer conversation={conv} bot={bot} />
        </section>
      ) : (
        <section className="flex items-center justify-center text-muted">Conversa não encontrada.</section>
      )}
      {bot ? <ComputerPanel bot={bot} /> : <aside className="border-l border-line" />}
    </div>
  );
}

function ChatMobile() {
  const navigate = useNavigate();
  const { conversationId, conv, bot } = useActiveConversation();
  if (!conversationId || !conv) {
    return (
      <main className="flex h-[calc(100dvh-72px)] flex-col pt-10">
        <h1 className="px-4 pb-1 text-[20px] font-semibold text-white">Chat</h1>
        <div className="min-h-0 flex-1">
          <ConversationList onOpen={(id) => navigate(`/chat/${id}`)} />
        </div>
      </main>
    );
  }
  return (
    <main className="flex h-[calc(100dvh-72px)] flex-col">
      <header className="flex items-center gap-3 border-b border-line px-3 pb-3 pt-11">
        <button onClick={() => navigate("/chat")} className="p-1 text-white" aria-label="Voltar">
          <ChevronLeft size={22} />
        </button>
        {bot ? <Figurinha f={bot.figurinha} size={40} status={bot.status} /> : avatarFor(conv, undefined)}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-white">{conv.title}</div>
          {bot && (
            <div className="text-[12px]" style={{ color: bot.status === "ocioso" ? "#8b95a7" : statusColor[bot.status] }}>
              {statusLabel[bot.status]}
            </div>
          )}
        </div>
        {bot && (
          <Link to={`/computador/${bot.id}`} className="p-2 text-soft" aria-label="Ver computador">
            <Monitor size={20} />
          </Link>
        )}
      </header>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="text-center text-[12px] text-muted">hoje · {conv.messages[0]?.time ?? ""}</div>
        {conv.messages.map((m) => (
          <MessageRow key={m.id} m={m} compact />
        ))}
        <ScrollToEnd dep={conv.messages.length} />
      </div>
      <Composer conversation={conv} bot={bot} compact />
    </main>
  );
}
