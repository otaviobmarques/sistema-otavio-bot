import { Bot as BotIcon, Building2, CircleCheck, MessageSquare, Mic } from "lucide-react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useCounts } from "../state/store";
import { Dot, Toasts, useIsMobile } from "./ui";

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/" className="flex items-center gap-2.5">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tavinho text-ink-900">
        <BotIcon size={18} strokeWidth={2.2} />
      </span>
      {!compact && <span className="font-display text-[17px] font-semibold text-white">Otávio Bot</span>}
    </Link>
  );
}

const links = [
  { to: "/", label: "Prédio", end: true },
  { to: "/chat", label: "Chat" },
  { to: "/empresas", label: "Empresas" },
  { to: "/conselho", label: "Conselho" },
  { to: "/contratar", label: "Contratar bot" },
  { to: "/extensoes", label: "Extensões" },
];

function TopNav() {
  const counts = useCounts();
  const loc = useLocation();
  const onComputer = loc.pathname.startsWith("/computador");
  return (
    <header className="sticky top-0 z-30 flex h-[62px] items-center gap-6 border-b border-line bg-ink-900/95 px-7 backdrop-blur">
      <Logo />
      <nav className="flex items-center gap-1 text-[14.5px]">
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) =>
              `flex items-center gap-2 rounded-lg px-3 py-1.5 transition ${
                isActive || (l.to === "/chat" && onComputer) ? "bg-ink-700 font-medium text-white" : "text-muted hover:text-white"
              }`
            }
          >
            {l.label}
            {l.to === "/chat" && counts.unread > 0 && (
              <span className="rounded-full bg-ok px-2 text-[11px] font-semibold leading-[18px] text-ink-900">{counts.unread}</span>
            )}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2.5">
        {onComputer ? (
          <Link to="/chat/otavio" className="chip hover:bg-ink-700">
            ← Voltar ao chat
          </Link>
        ) : (
          <>
            <span className="chip">
              <Dot color="#22c55e" size={7} />
              {counts.working} bots trabalhando
            </span>
            {counts.approvals > 0 && (
              <Link to="/conselho" className="chip border-wait text-wait hover:bg-wait/10">
                <Dot color="#f59e0b" size={7} />
                {counts.approvals} {counts.approvals === 1 ? "aprovação pendente" : "aprovações pendentes"}
              </Link>
            )}
            <Link to="/tavinho" title="Falar com o Tavinho" className="btn h-9 w-9 p-0">
              <Mic size={16} />
            </Link>
          </>
        )}
      </div>
    </header>
  );
}

function MobileTabs() {
  const counts = useCounts();
  const tabs = [
    { to: "/", label: "Prédio", icon: Building2, end: true },
    { to: "/chat", label: "Chat", icon: MessageSquare, badge: counts.unread > 0 ? "ok" : undefined },
    { to: "/conselho", label: "Conselho", icon: CircleCheck, badge: counts.approvals > 0 ? "wait" : undefined },
    { to: "/tavinho", label: "Tavinho", icon: Mic },
  ] as const;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t border-line bg-ink-900/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={"end" in t ? t.end : undefined}
          className={({ isActive }) => `flex flex-col items-center gap-1 py-2.5 text-[11px] ${isActive ? "text-tavinho-soft" : "text-muted"}`}
        >
          <t.icon size={20} strokeWidth={1.7} />
          <span className="flex items-center gap-1">
            {t.label}
            {"badge" in t && t.badge && <Dot color={t.badge === "wait" ? "#f59e0b" : "#22c55e"} size={7} />}
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

export function Shell({ bare = false }: { bare?: boolean }) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <div className="min-h-screen bg-ink-900 pb-[72px]">
        <Outlet />
        <MobileTabs />
        <Toasts />
      </div>
    );
  }
  return (
    <div className="min-h-screen bg-ink-900">
      {!bare && <TopNav />}
      <Outlet />
      <Toasts />
    </div>
  );
}
