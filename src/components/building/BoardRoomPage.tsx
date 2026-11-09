import { useEffect, useState } from "react";
import { Check, ExternalLink, Gavel, Loader2 } from "lucide-react";
import type { InboxRow, InboxView } from "../../../shared/inbox";
import { t } from "@/lib/i18n";
import { useShowThreads } from "@/lib/thread-preferences";
import { useInboxReady, useInboxSupport } from "@/state/inbox";
import { openBot, useStore, type Bot } from "@/state/store";
import { useCaptionChrome } from "../DesktopCapabilities";
import { InboxSender } from "../InboxLine";
import { threadUpdatedLabel } from "../SidebarThreadRow";
import { InboxAnswer } from "../inbox/InboxAnswer";
import { answerKindOf, headlineOf, type InboxAnswerKind } from "../inbox/inbox-answer";
import { senderLabel, subjectOf } from "../inbox/inbox-view";
import { useInboxActions } from "../inbox/use-inbox-actions";
import { BLOCKED_REASON_LABEL, type BlockedReason } from "./building-view";
import { DeskFace } from "./Desk";
import { useDesks } from "./use-desks";

/** Answers whose own card already says what is asked. */
const SAYS_ITSELF: ReadonlySet<InboxAnswerKind> = new Set(["approval", "password", "sign-in", "connect"]);

const OPEN_BUTTON = "flex shrink-0 items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[12px] font-medium text-ink hover:bg-raised/60 outline-none focus-visible:ring-2 focus-visible:ring-focus";

function BoardItem({ view, row, now }: { view: InboxView; row: InboxRow; now: number }) {
  const { openInChat, askerOf } = useInboxActions(view);
  const asker = askerOf(row);
  const sender = senderLabel(row);
  const kind = answerKindOf(row);
  return (
    <article data-board-item={row.id} aria-label={`${sender} · ${headlineOf(row)}`} className="rounded-2xl border border-warning/70 bg-card px-5 py-4">
      <header className="flex min-w-0 items-start gap-3">
        <button type="button" data-board-open-bot={row.from.botId ?? ""} onClick={() => openInChat(row)} title={t("board.openBotChat", { name: row.from.name })}
          className="shrink-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-focus">
          <InboxSender from={row.from} size={32} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <button type="button" onClick={() => openInChat(row)} className="min-w-0 truncate text-[15px] font-semibold text-ink hover:underline">{sender}</button>
            <span className="min-w-0 truncate text-[12px] text-ink-tertiary">{[row.origin?.title, threadUpdatedLabel(row.at, now)].filter(Boolean).join(" · ")}</span>
          </div>
          {!SAYS_ITSELF.has(kind) && <p className="mt-0.5 line-clamp-2 break-words text-[14px] leading-6 text-ink">{headlineOf(row)}</p>}
        </div>
        <span className="shrink-0 rounded-full border border-warning px-2.5 py-0.5 text-[11px] text-warning">{subjectOf(row)}</span>
      </header>
      <div className="mt-3">
        <InboxAnswer kind={kind} view={view} row={row} asker={asker} />
      </div>
    </article>
  );
}

function BlockedBot({ bot, reason, onOpen }: { bot: Bot; reason: BlockedReason; onOpen: () => void }) {
  return (
    <article data-board-blocked={bot.id} className="flex items-center gap-3 rounded-2xl border border-danger/70 bg-card px-5 py-4">
      <DeskFace bot={bot} status="blocked" size={28} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[14px] font-semibold text-ink">{t("board.blocked.title", { name: bot.name })}</p>
        <p className="text-[13px] text-ink-secondary">{t(BLOCKED_REASON_LABEL[reason])}</p>
      </div>
      <button type="button" onClick={onOpen} className={OPEN_BUTTON}><ExternalLink size={13} aria-hidden="true" />{t("board.openChat")}</button>
    </article>
  );
}

export function BoardRoomPage() {
  const { dispatch } = useStore();
  const { dragProps } = useCaptionChrome();
  const showThreads = useShowThreads();
  const desks = useDesks();
  const ready = useInboxReady();
  const support = useInboxSupport();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const loading = !ready && support !== "no";

  return (
    <main data-board-page="" className="flex min-w-0 flex-1 flex-col overflow-hidden bg-app text-ink">
      <header {...dragProps} className="shrink-0 border-b border-hairline/40 px-6 py-4 max-md:pl-12">
        <div className="flex items-center gap-2.5">
          <Gavel size={18} aria-hidden="true" className="text-ink-secondary" />
          <h1 className="text-[20px] font-semibold">{t("board.title")}</h1>
          {desks.pending > 0 && <span data-board-count={desks.pending} className="rounded-full bg-warning px-2 text-[12px] font-semibold tabular-nums text-panel">{desks.pending}</span>}
        </div>
        <p className="mt-1 max-w-[640px] text-[13px] text-ink-secondary">{t("board.description")}</p>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-3.5 px-6 py-6">
          {desks.view && desks.items.map((row) => <BoardItem key={row.id} view={desks.view!} row={row} now={now} />)}
          {desks.blocked.map(({ bot, reason }) => <BlockedBot key={bot.id} bot={bot} reason={reason} onOpen={() => openBot(dispatch, bot, showThreads)} />)}
          {loading && desks.pending === 0 && (
            <p className="flex items-center gap-2 text-[13px] text-ink-secondary"><Loader2 size={14} aria-hidden="true" className="animate-spin" />{t("board.loading")}</p>
          )}
          {!loading && desks.pending === 0 && (
            <div data-board-empty="" className="flex flex-col items-center rounded-2xl border border-hairline/70 bg-card px-6 py-10 text-center">
              <Check size={22} aria-hidden="true" className="text-success" />
              <p className="mt-3 text-[15px] font-medium text-ink">{t("board.empty")}</p>
              <p className="mt-1 max-w-[26rem] text-[13px] text-ink-secondary">{t("board.emptyHint")}</p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
