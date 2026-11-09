import { Clock, FileText, Github } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { connectedApps, mcpServers, modelKeys, policies, type Bot, type Skill } from "../data/mock";
import { Dot, Rich } from "../components/ui";
import { palette } from "../lib/colors";
import { usePortal } from "../state/store";

const tabs = [
  { id: "skills", label: "Skills" },
  { id: "mcp", label: "Servidores MCP" },
  { id: "apps", label: "Apps conectados" },
  { id: "politicas", label: "Políticas" },
  { id: "modelos", label: "Modelos e chaves" },
] as const;
type TabId = (typeof tabs)[number]["id"];

function BotLetters({ ids }: { ids: string[] }) {
  const { state } = usePortal();
  if (ids[0] === "todos") return <span className="rounded bg-ink-700 px-1.5 py-0.5 text-[10.5px] font-semibold text-soft">todos</span>;
  return (
    <span className="flex gap-1">
      {ids.map((id) => {
        const b = state.bots.find((x) => x.id === id);
        if (!b) return null;
        const c = palette[b.figurinha.color];
        const label = b.id === "tavinho" ? "Tv" : b.name.charAt(0);
        return (
          <span key={id} title={`${b.name} · ${b.role}`} className="flex h-[22px] min-w-[22px] items-center justify-center rounded px-1 text-[10.5px] font-bold" style={{ background: c.bg, color: c.face }}>
            {label}
          </span>
        );
      })}
    </span>
  );
}

function SkillIcon({ kind }: { kind: Skill["kind"] }) {
  const Icon = kind === "github" ? Github : kind === "gravada" ? Clock : FileText;
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-line-strong bg-ink-900 text-soft">
      <Icon size={16} />
    </span>
  );
}

function InstallSkill() {
  const { state, installSkill, toast } = usePortal();
  const [url, setUrl] = useState("https://github.com/anthropics/skills/tree/main/skills/pptx");
  const [read, setRead] = useState(true);
  const targets: { id: string; label: string; bots: string[] }[] = [
    { id: "lia", label: "Lia · Roteirista", bots: ["lia"] },
    { id: "duda", label: "Duda · Copy", bots: ["duda"] },
    { id: "otavio", label: "Otávio · Designer", bots: ["otavio"] },
    { id: "redbox", label: "toda a RedBox", bots: state.bots.filter((b: Bot) => b.companyId === "redbox" && b.hired).map((b) => b.id) },
  ];
  const [checked, setChecked] = useState<string[]>(["lia", "duda"]);
  const recipients = [...new Set(targets.filter((t) => checked.includes(t.id)).flatMap((t) => t.bots))];
  const name = url.split("/").filter(Boolean).pop() ?? "skill";

  return (
    <section className="card px-5 py-5">
      <h2 className="text-[16px] font-semibold text-white">Instalar skill do GitHub</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
        Cole a URL de um repositório ou pasta. O Otávio Bot lê o <code className="font-mono">SKILL.md</code>, mostra o que a skill faz e quais permissões pede, e você escolhe quem recebe.
      </p>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setRead(true);
          toast(`SKILL.md de ${name} lido (simulado).`);
        }}
      >
        <input className="field" value={url} onChange={(e) => {
            setUrl(e.target.value);
            setRead(false);
          }} aria-label="URL da skill" />
        <button className="btn btn-primary px-4">Ler skill</button>
      </form>
      {read && (
        <div className="mt-3 rounded-xl border border-line bg-ink-900 px-4 py-4">
          <div className="flex flex-wrap items-start gap-3">
            <SkillIcon kind="github" />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-white">{name} · Criar e editar apresentações PowerPoint</div>
              <div className="text-[12.5px] text-muted">anthropics/skills · Apache-2.0 · atualizada há 3 dias · 2 scripts, 1 referência</div>
            </div>
            <span className="chip">
              <Dot color="#22c55e" size={7} /> SKILL.md válido
            </span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="chip">pede: executar scripts Python</span>
            <span className="chip">pede: ler e gravar arquivos em ~/trabalho</span>
            <span className="chip border-ok/60">não pede: internet</span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[12.5px] text-muted">Dar para:</span>
            {targets.map((t) => (
              <label key={t.id} className="chip cursor-pointer gap-2 px-3 py-1.5">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#3b82f6]"
                  checked={checked.includes(t.id)}
                  onChange={() => setChecked((c) => (c.includes(t.id) ? c.filter((x) => x !== t.id) : [...c, t.id]))}
                />
                {t.label}
              </label>
            ))}
          </div>
          <div className="mt-3 flex justify-end">
            <button
              className="btn btn-primary"
              disabled={recipients.length === 0}
              onClick={() => {
                installSkill({ name, source: "anthropics/skills · v1.0", kind: "github", bots: recipients, state: "ativa" });
                setRead(false);
              }}
            >
              Instalar para {recipients.length} {recipients.length === 1 ? "bot" : "bots"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function InstalledSkills() {
  const { state, updateSkill, toast } = usePortal();
  return (
    <section className="card px-5 py-4">
      <div className="mb-1 flex items-center justify-between">
        <span className="eyebrow">Skills instaladas · {state.skills.length + 4}</span>
        <span className="flex gap-3 text-[13.5px] text-tavinho-soft">
          <button className="hover:underline" onClick={() => state.skills.filter((s) => s.state === "atualizar").forEach((s) => updateSkill(s.id))}>
            Atualizar todas
          </button>
          <button className="hover:underline" onClick={() => toast("Criar skill: escreva em Markdown ou grave uma demonstração (Teach-a-task).")}>
            Criar skill
          </button>
        </span>
      </div>
      <ul className="divide-y divide-line">
        {state.skills.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <SkillIcon kind={s.kind} />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-white">{s.name}</div>
              <div className="truncate text-[12.5px] text-muted">
                <Rich text={s.source.replace("**atualização disponível**", "[atualização disponível]")} onLink={() => updateSkill(s.id)} />
              </div>
            </div>
            <BotLetters ids={s.bots} />
            {s.state === "atualizar" ? (
              <button className="chip border-wait text-wait hover:bg-wait/10" onClick={() => updateSkill(s.id)}>
                <Dot color="#f59e0b" size={7} /> atualizar
              </button>
            ) : (
              <span className="chip">
                <Dot color="#22c55e" size={7} /> ativa
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function McpPanel() {
  const { toast } = usePortal();
  return (
    <section className="card px-5 py-4">
      <div className="flex items-center justify-between">
        <span className="eyebrow">Servidores MCP · {mcpServers.length}</span>
        <button className="btn px-3 py-1.5" onClick={() => toast("Adicionar servidor MCP: local (stdio) ou remoto (HTTP).")}>
          + Adicionar
        </button>
      </div>
      <p className="mt-1 text-[12.5px] text-muted">Local (stdio) ou remoto (HTTP). Cada servidor vira ferramentas que você dá aos bots.</p>
      <ul className="mt-1 divide-y divide-line">
        {mcpServers.map((s) => (
          <li key={s.id} className="flex items-center gap-3 py-3">
            <Dot color={s.ok ? "#22c55e" : "#ef4444"} />
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold text-white">
                {s.name} <span className="font-mono text-[12.5px] font-normal text-muted">· {s.transport}</span>
              </div>
              <div className="truncate text-[12.5px] text-muted">
                {s.warning ? (
                  <>
                    <span className="text-block">{s.warning}</span> ·{" "}
                    <button className="text-tavinho-soft hover:underline" onClick={() => toast("Reconectando o WhatsApp oficial (simulado).")}>
                      reconectar
                    </button>
                  </>
                ) : (
                  s.detail
                )}
              </div>
            </div>
            <BotLetters ids={s.bots} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function AppsPanel() {
  const { toast } = usePortal();
  const color = { ok: "#22c55e", atencao: "#f59e0b", off: "#6b7280" } as const;
  return (
    <section className="card px-5 py-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="eyebrow">Apps conectados · 500+ disponíveis</span>
        <button className="btn px-3 py-1.5" onClick={() => toast("Conectar app: OAuth via Composio ou Pipedream (simulado).")}>
          + Conectar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {connectedApps.map((a) => (
          <button
            key={a.name}
            onClick={() => toast(a.state === "off" ? `${a.name}: clique em Conectar para autorizar.` : `${a.name}: conectado.`)}
            className="flex items-center justify-between rounded-lg border border-line bg-ink-900 px-3 py-2 text-left text-[13px] text-soft hover:bg-ink-750"
          >
            {a.name}
            <Dot color={color[a.state]} size={7} />
          </button>
        ))}
      </div>
    </section>
  );
}

function ModelsPanel() {
  return (
    <section className="card px-5 py-4">
      <span className="eyebrow">Modelos e chaves</span>
      <ul className="mt-2 divide-y divide-line">
        {modelKeys.map((k) => (
          <li key={k.name} className="flex items-center gap-3 py-3">
            <Dot color={k.ok ? "#22c55e" : "#6b7280"} />
            <div>
              <div className="text-[14.5px] font-semibold text-white">{k.name}</div>
              <div className="text-[12.5px] text-muted">
                {k.detail}
                {k.action && (
                  <>
                    {" · "}
                    <span className="text-tavinho-soft">{k.action}</span>
                  </>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

function PoliciesPanel() {
  return (
    <section className="card px-5 py-4">
      <span className="eyebrow">Políticas do gateway</span>
      <p className="mt-1 text-[12.5px] text-muted">Toda ação de navegador, arquivo ou shell passa por estas regras antes de executar. Deny é avaliado antes de allow; sem regra, nada é permitido.</p>
      <table className="mt-3 w-full text-[13.5px]">
        <thead>
          <tr className="border-b border-line text-left text-[12px] text-muted">
            <th className="py-2 font-medium">Escopo</th>
            <th className="py-2 font-medium">Regra</th>
            <th className="py-2 font-medium">Efeito</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.rule} className="border-b border-line last:border-0">
              <td className="py-2.5 pr-3 text-white">{p.scope}</td>
              <td className="py-2.5 pr-3 font-mono text-[12.5px] text-soft">{p.rule}</td>
              <td className="py-2.5 text-soft">{p.effect}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ExtensoesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (tabs.find((t) => t.id === params.get("aba"))?.id ?? "skills") as TabId;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-1 border-b border-line px-7 py-3">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setParams(t.id === "skills" ? {} : { aba: t.id })}
            className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium ${tab === t.id ? "bg-ink-700 text-white" : "text-muted hover:text-white"}`}
          >
            {t.label}
          </button>
        ))}
        <span className="ml-auto hidden text-[13px] text-muted lg:block">Tudo que você instala aqui fica disponível para dar aos bots, por bot ou por empresa.</span>
      </div>
      <div className="mx-auto max-w-[1340px] px-4 py-6 sm:px-14">
        {tab === "skills" && (
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <InstallSkill />
              <InstalledSkills />
            </div>
            <div className="space-y-5">
              <McpPanel />
              <AppsPanel />
              <ModelsPanel />
            </div>
          </div>
        )}
        {tab === "mcp" && <McpPanel />}
        {tab === "apps" && <AppsPanel />}
        {tab === "politicas" && <PoliciesPanel />}
        {tab === "modelos" && <ModelsPanel />}
      </div>
    </div>
  );
}
