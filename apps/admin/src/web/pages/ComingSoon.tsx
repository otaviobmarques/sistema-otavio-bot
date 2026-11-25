import { Boxes, CheckCircle2, ServerCog } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "../ui.tsx";

const CONTENT: Record<"instances" | "computers", { title: string; subtitle: string; icon: ReactNode; ready: string[]; next: string[] }> = {
  instances: {
    title: "Instâncias",
    subtitle: "Uma instância isolada por cliente: o contêiner cloud-home, com o contrato OMB_CLOUD_*.",
    icon: <Boxes className="h-7 w-7" />,
    ready: [
      "Tabelas instances e nodes (nó, slug, machine_id, segredo de bootstrap cifrado)",
      "Estados setting_up, ready, stopped, payment_problem e failed já seguem a cobrança",
      "Modo do plano: instância dedicada, nuvem compartilhada limitada ou só no PC",
    ],
    next: [
      "Provisionar e remover o contêiner nos nós, com OMB_CLOUD_MACHINE_ID e o segredo de bootstrap",
      "Nó compartilhado de alta densidade para o modo limitado (dorme ocioso, apagado após inatividade longa)",
      "Saúde e pareamento pelas chamadas assinadas /api/cloud/health e /api/cloud/pairing",
    ],
  },
  computers: {
    title: "Computadores (VPS)",
    subtitle: "Computadores individuais por bot: os incluídos no plano e o adicional de R$ 159,00/mês por bot.",
    icon: <ServerCog className="h-7 w-7" />,
    ready: [
      "Tabelas vps_machines e vps_provider_accounts, com o token da Hostinger cifrado (Integrações)",
      "Adicional “Computador individual (VPS)” cobrado por bot junto da assinatura",
      "Plano registra quantos VPS vêm incluídos",
    ],
    next: [
      "Interface VpsProvider, começando pela Hostinger: criar, ligar, desligar e apagar",
      "Vincular cada VPS a um bot e ao nó da instância do cliente",
      "Custos por máquina para comparar com a receita",
    ],
  },
};

export function ComingSoon({ kind }: { kind: keyof typeof CONTENT }) {
  const content = CONTENT[kind];
  return (
    <>
      <PageHeader title={content.title} subtitle={content.subtitle} />
      <div className="brand-glow overflow-hidden rounded-3xl p-10 text-white shadow-xl">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-cyan-brand/15 text-cyan-brand">{content.icon}</span>
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-brand">Próxima parte</div>
            <div className="font-display text-2xl font-bold">Esta tela chega com o provisionamento</div>
          </div>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="mb-3 text-sm font-semibold text-white">Já pronto nesta parte</div>
            <ul className="space-y-2.5 text-sm text-slate-300">
              {content.ready.map((item) => <li key={item} className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-cyan-brand" />{item}</li>)}
            </ul>
          </div>
          <div className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
            <div className="mb-3 text-sm font-semibold text-white">Vem depois</div>
            <ul className="space-y-2.5 text-sm text-slate-300">
              {content.next.map((item) => <li key={item} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500" />{item}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </>
  );
}
