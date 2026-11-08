import { File, Folder, FolderOpen, Send, Undo2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { InitialsTile, Bar, Dot, Rich, Pill } from "../components/ui";
import { companyName, computerFor, departmentName } from "../lib/computer";
import { toneColor } from "../lib/colors";
import { usePortal } from "../state/store";

export function ComputadorPage() {
  const { botId } = useParams();
  const { state, takeControl, releaseControl, toast } = usePortal();
  const bot = state.bots.find((b) => b.id === botId);
  const [tab, setTab] = useState(0);
  const [code, setCode] = useState<string[]>(["", "", "", "", "", ""]);
  const [paused, setPaused] = useState(false);

  if (!bot) {
    return (
      <main className="p-10 text-center text-muted">
        Bot não encontrado. <Link to="/" className="text-tavinho-soft">Voltar ao prédio</Link>
      </main>
    );
  }
  const pc = computerFor(bot);
  const controlling = state.controlling === bot.id;
  const blocked = bot.status === "bloqueado";
  const twoFA = bot.id === "otavio" && (blocked || controlling);
  const botAudit = state.audit.filter((a) => a.bot === bot.name);

  return (
    <div className="min-h-[calc(100vh-62px)]">
      <header className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-4 sm:px-7">
        <InitialsTile bot={bot} size={42} />
        <div className="min-w-0 flex-1">
          <div>
            <span className="font-display text-[17px] font-semibold text-white">Computador do {bot.name}</span>
            <span className="text-[13px] text-muted">
              {" "}
              · {departmentName(bot)} · {companyName(bot)}
            </span>
          </div>
          <div className="text-[12.5px] text-muted">
            <Rich text={pc.container} />
          </div>
        </div>
        {controlling ? (
          <Pill tone="info">Você está no controle · o bot espera</Pill>
        ) : blocked ? (
          <Pill tone="block">Bloqueado: pede sua ajuda no login do Canva (2FA)</Pill>
        ) : (
          <Pill tone={paused ? "idle" : "ok"}>{paused ? "pausado por você" : bot.activity}</Pill>
        )}
        {controlling ? (
          <button
            className="btn btn-ok"
            onClick={() => {
              releaseControl(bot.id);
              setCode(["", "", "", "", "", ""]);
            }}
          >
            <Undo2 size={15} /> Devolver ao bot
          </button>
        ) : (
          <button className="btn btn-primary" onClick={() => takeControl(bot.id)}>
            <Send size={15} /> Assumir controle
          </button>
        )}
        <button
          className="btn"
          onClick={() => {
            setPaused((p) => !p);
            toast(paused ? `${bot.name} retomou o trabalho.` : `${bot.name} foi pausado.`);
          }}
        >
          {paused ? "Retomar bot" : "Pausar bot"}
        </button>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_360px]">
        <main className="min-w-0 px-4 py-5 sm:px-7">
          <div className="mb-4 flex gap-2 overflow-x-auto">
            {pc.tabs.map((t, i) => (
              <button
                key={t}
                onClick={() => setTab(i)}
                className={`rounded-lg px-3.5 py-2 text-[13.5px] font-medium ${tab === i ? "bg-ink-700 text-white" : "text-muted hover:text-white"}`}
              >
                {t}
              </button>
            ))}
          </div>

          {tab === 0 && (
            <>
              <div className="card overflow-hidden">
                <div className="flex items-center gap-3 border-b border-line px-3.5 py-2.5">
                  <span className="flex gap-1.5">
                    <Dot color="#ef4444" />
                    <Dot color="#f59e0b" />
                    <Dot color="#22c55e" />
                  </span>
                  <span className="flex-1 truncate rounded-md bg-ink-900 px-3 py-1.5 font-mono text-[13px] text-soft">{pc.url}</span>
                  <span className="chip text-[11.5px]">{pc.profile}</span>
                </div>
                <div className="relative flex h-[480px] items-center justify-center bg-ink-850">
                  {twoFA ? (
                    <div className={`mx-4 w-full max-w-[436px] rounded-xl bg-slate-50 p-7 text-slate-900 shadow-2xl ${controlling ? "ring-4 ring-tavinho" : ""}`}>
                      <h3 className="font-sans text-[19px] font-semibold">Verificação em duas etapas</h3>
                      <p className="mt-1 text-[13.5px] text-slate-500">Enviamos um código de 6 dígitos para o celular terminado em ••58.</p>
                      <div className="mt-5 flex justify-between gap-2">
                        {code.map((c, i) => (
                          <input
                            key={i}
                            value={c}
                            disabled={!controlling}
                            maxLength={1}
                            inputMode="numeric"
                            aria-label={`dígito ${i + 1}`}
                            onChange={(e) => {
                              const v = e.target.value.replace(/\D/g, "");
                              setCode((old) => old.map((x, j) => (j === i ? v : x)));
                              const next = e.target.nextElementSibling as HTMLInputElement | null;
                              if (v && next) next.focus();
                            }}
                            className="h-11 w-full rounded-md border border-slate-300 bg-white text-center text-lg font-semibold outline-none focus:border-violet-600 disabled:bg-white"
                          />
                        ))}
                      </div>
                      <button
                        disabled={!controlling}
                        onClick={() => releaseControl(bot.id)}
                        className="mt-4 w-full rounded-md bg-violet-600 py-2.5 text-[14px] font-semibold text-white disabled:opacity-90"
                      >
                        Continuar
                      </button>
                    </div>
                  ) : (
                    <div className="w-[70%] space-y-3">
                      <div className="h-4 w-1/2 rounded bg-ink-700" />
                      {[0, 1, 2, 3, 4].map((i) => (
                        <div key={i} className={`h-10 rounded-lg border ${i === 2 ? "border-tavinho bg-tavinho/10" : "border-line bg-ink-800"}`} />
                      ))}
                      <p className="pt-2 text-center text-xs text-muted">Tela ao vivo simulada · {bot.activity}</p>
                    </div>
                  )}
                  {twoFA && pc.blockedNote && !controlling && (
                    <div className="absolute inset-x-4 bottom-5 max-w-[490px] rounded-xl sm:left-6 sm:right-auto border border-block/70 bg-ink-900/95 px-4 py-3 text-[13.5px] leading-snug text-soft">
                      <span className="flex gap-3">
                        <Dot color="#ef4444" className="mt-[6px]" />
                        <span>
                          <Rich text={pc.blockedNote} />
                        </span>
                      </span>
                    </div>
                  )}
                  {controlling && (
                    <div className="absolute bottom-5 left-6 rounded-xl border border-tavinho/70 bg-ink-900/95 px-4 py-3 text-[13.5px] text-soft">
                      Você está no controle. Digite o código e clique em <strong className="text-white">Continuar</strong> ou em{" "}
                      <strong className="text-white">Devolver ao bot</strong>.
                    </div>
                  )}
                </div>
              </div>
              <Terminal lines={pc.terminal} />
            </>
          )}
          {tab === 1 && <Terminal lines={pc.terminal} tall />}
          {tab === 2 && (
            <div className="card p-5">
              <FileTree files={pc.files} />
            </div>
          )}
          {tab === 3 && (
            <div className="card divide-y divide-line">
              {pc.logins.map((l) => (
                <div key={l.site} className="flex items-center justify-between px-5 py-3.5 text-sm">
                  <span className="flex items-center gap-2.5 text-white">
                    <Dot color={l.ok ? "#22c55e" : "#6b7280"} /> {l.site}
                  </span>
                  <span className="text-muted">{l.account}</span>
                </div>
              ))}
            </div>
          )}
          {tab === 4 && (
            <div className="card divide-y divide-line">
              {botAudit.length === 0 && <p className="px-5 py-6 text-sm text-muted">Nenhuma ação deste bot hoje.</p>}
              {botAudit.map((a) => (
                <div key={a.id} className="grid grid-cols-[60px_1fr_auto] items-center gap-3 px-5 py-3 text-sm">
                  <span className="text-muted">{a.time}</span>
                  <span className="font-mono text-[12.5px] text-soft">{a.action}</span>
                  <span className="flex items-center gap-2 text-soft">
                    <Dot color={toneColor[a.tone]} /> {a.result}
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>

        <aside className="space-y-4 border-line px-4 py-5 sm:px-5 lg:border-l">
          <div className="card px-4 py-4">
            <div className="mb-3 text-[12.5px] text-muted">
              Arquivos do bot · <span className="font-mono">~/trabalho</span>
            </div>
            <FileTree files={pc.files} />
          </div>
          <div className="card px-4 py-4">
            <div className="mb-2.5 text-[12.5px] text-muted">
              Logins deste bot <span className="text-muted/70">· só ele enxerga</span>
            </div>
            <ul className="space-y-1.5 text-[13.5px]">
              {pc.logins.map((l) => (
                <li key={l.site} className="flex justify-between">
                  <span className="flex items-center gap-2 text-white">
                    <Dot color={l.ok ? "#22c55e" : "#6b7280"} size={7} /> {l.site}
                  </span>
                  <span className="text-muted">{l.account}</span>
                </li>
              ))}
            </ul>
            <button className="btn mt-3 w-full" onClick={() => toast("Adicionar login: abre o navegador do bot para você entrar.")}>
              Adicionar login
            </button>
          </div>
          <div className="card px-4 py-4">
            <div className="mb-2 text-[12.5px] text-muted">Políticas aplicadas</div>
            <ul className="list-disc space-y-1 pl-4 text-[13.5px] leading-relaxed text-soft">
              {pc.policies.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
            <Link to="/extensoes?aba=politicas" className="mt-2 inline-block text-[13.5px] text-tavinho-soft hover:underline">
              Editar políticas
            </Link>
          </div>
          <div className="card px-4 py-4">
            <div className="mb-2 text-[12.5px] text-muted">Recursos</div>
            <div className="space-y-2.5 text-[12.5px] text-soft">
              <div>
                CPU
                <Bar value={pc.resources.cpu} max={100} className="mt-1" />
              </div>
              <div>
                Memória · {pc.resources.memory}
                <Bar value={pc.resources.memoryPct} max={100} className="mt-1" />
              </div>
              <div>
                Tokens hoje · {pc.resources.tokens}
                <Bar value={pc.resources.tokensPct} max={100} className="mt-1" />
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Terminal({ lines, tall = false }: { lines: string[]; tall?: boolean }) {
  return (
    <div className={`card mt-4 px-4 py-3.5 ${tall ? "min-h-[480px]" : ""}`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">Terminal · ~/trabalho</span>
        <span className="chip text-[11.5px]">usuário: bot (sem sudo)</span>
      </div>
      <pre className="whitespace-pre-wrap font-mono text-[12.5px] leading-[1.7] text-soft">{lines.join("\n")}</pre>
    </div>
  );
}

function FileTree({ files }: { files: ReturnType<typeof computerFor>["files"] }) {
  return (
    <ul className="space-y-2 text-[14px]">
      {files.map((f) => (
        <li key={f.name} className="flex items-center gap-2.5 text-soft" style={{ paddingLeft: f.depth * 24 }}>
          {f.kind === "file" ? (
            <File size={15} className="text-muted" />
          ) : f.kind === "shared" ? (
            <Folder size={15} className="text-tavinho" />
          ) : (
            <FolderOpen size={15} className="text-wait" />
          )}
          {f.name}
          {f.note && <span className="text-[12px] text-muted">{f.note}</span>}
        </li>
      ))}
    </ul>
  );
}
