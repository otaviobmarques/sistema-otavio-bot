import { Bot, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import type { ArkoBotStatus, ArkoBotView } from "../../customer/arkobot.ts";
import { api, useApi } from "../../web/api.ts";
import { Button, Card, Spinner, cx, useToast } from "../../web/ui.tsx";
import { WhatsAppButton } from "../shared.tsx";

const COPY: Record<Exclude<ArkoBotStatus, "none">, { title: string; text: string; tone: string }> = {
  preparing: { title: "Preparando…", tone: "bg-cyan-soft text-navy-900",
    text: "Seu ArkoBot está sendo criado no nosso servidor. Leva poucos minutos; esta página atualiza sozinha." },
  ready: { title: "Pronto", tone: "bg-emerald-50 text-emerald-800",
    text: "Seu ArkoBot está ligado 24 horas. Abra quando quiser: você entra direto, sem senha." },
  payment_pending: { title: "Pronto — pagamento pendente", tone: "bg-amber-50 text-amber-900",
    text: "Seu ArkoBot continua funcionando, mas há uma fatura em aberto. Pague para ele não ser pausado." },
  paused_payment: { title: "Pausado por pagamento", tone: "bg-amber-50 text-amber-900",
    text: "Seu ArkoBot está pausado e os seus dados continuam guardados. Pague a fatura em aberto e ele volta sozinho em minutos." },
  paused: { title: "Pausado", tone: "bg-slate-100 text-slate-700",
    text: "Seu ArkoBot está pausado e os seus dados continuam guardados. Fale com a gente para ligá-lo de novo." },
  failed: { title: "Com problema", tone: "bg-red-50 text-red-700",
    text: "Algo deu errado ao ligar o seu ArkoBot. Nossa equipe já foi avisada; se quiser, fale com a gente." },
};

/** "Meu ArkoBot": the instance's state and a button that opens it, already signed in, in a new tab. */
export function MeuArkoBotCard() {
  const { data, reload } = useApi<ArkoBotView>("/api/conta/arkobot");
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  const waiting = data?.status === "preparing";
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(reload, 10_000);
    return () => clearInterval(timer);
  }, [waiting, reload]);
  if (!data || data.status === "none") return null;
  const copy = COPY[data.status];

  const open = async () => {
    // The tab opens from the click itself (no pop-up blocker), cut off from this page; it gets its address after.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setOpening(true);
    try {
      const { url } = await api<{ url: string }>("/api/conta/arkobot/abrir", { method: "POST", body: {} });
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch (error) {
      tab?.close();
      toast((error as Error).message, "error");
      reload();
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card title={<span className="flex items-center gap-2"><Bot className="h-4 w-4 text-cyan-ink" /> Meu ArkoBot</span>}>
      <div className={cx("rounded-xl p-4", copy.tone)}>
        <div className="flex items-center gap-2 font-semibold">{waiting ? <Spinner /> : null}{copy.title}</div>
        <p className="mt-1 text-sm">{copy.text}</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {data.canOpen ? (
            <Button variant="accent" busy={opening} onClick={open}><ExternalLink className="h-4 w-4" /> Abrir meu ArkoBot</Button>
          ) : null}
          {data.status === "failed" || data.status === "paused" ? <WhatsAppButton message="Olá! Meu ArkoBot está parado, podem me ajudar?">Falar com a gente</WhatsAppButton> : null}
        </div>
        {data.url && data.status !== "preparing" ? <p className="mt-2 text-xs opacity-80">Endereço: {data.url.replace(/^https:\/\//, "")}</p> : null}
        {!data.canManage && (data.status === "ready" || data.status === "payment_pending")
          ? <p className="mt-2 text-xs opacity-80">Quem abre o ArkoBot por aqui é o responsável pela conta da empresa.</p> : null}
      </div>
    </Card>
  );
}
