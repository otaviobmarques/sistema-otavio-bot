import { KeyRound, LaptopMinimal, ServerCog } from 'lucide-react';
import { gruposDeIA } from '@/config/ias';
import { AnimacaoPreguicosa } from './AnimacaoPreguicosa';
import { CabecalhoSecao, Revelar } from './ui';

const ICONES = [LaptopMinimal, KeyRound, ServerCog];

export function SecaoIAs() {
  return (
    <section id="ias" aria-labelledby="ias-titulo" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <CabecalhoSecao
          id="ias-titulo"
          selo="Integração com inúmeras IAs"
          titulo={
            <>
              Escolha a IA certa <span className="texto-gradiente">para cada bot</span>
            </>
          }
          texto="Um bot pode usar Claude, outro ChatGPT, outro Gemini ou um modelo aberto no seu próprio servidor. Você troca o modelo quando quiser, sem refazer a equipe."
        />

        <Revelar className="relative mx-auto mt-14 max-w-5xl">
          <div aria-hidden className="absolute inset-10 -z-10 rounded-full bg-ciano/10 blur-3xl" />
          <AnimacaoPreguicosa
            tipo="ias"
            proporcao="1200 / 720"
            rotulo="Animação: Claude, ChatGPT, Gemini, Grok, DeepSeek, Mistral, Llama, Qwen, Kimi, GitHub Copilot, MiniMax e Ollama se conectando ao ArkoBot."
            className="overflow-hidden rounded-3xl border border-white/10"
          />
        </Revelar>

        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {gruposDeIA.map((grupo, i) => {
            const Icone = ICONES[i];
            return (
              <Revelar key={grupo.titulo} atraso={i * 0.1} as="article">
                <div className="h-full rounded-3xl border border-white/10 bg-white/[0.03] p-7">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-ciano/10 text-ciano">
                      <Icone className="h-5 w-5" aria-hidden />
                    </span>
                    <h3 className="font-display text-lg font-bold text-white">{grupo.titulo}</h3>
                  </div>
                  <p className="mt-3 text-sm leading-relaxed text-suave">{grupo.texto}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {grupo.nomes.map((nome) => (
                      <li
                        key={nome}
                        className="rounded-full border border-white/10 bg-noite px-3 py-1.5 text-sm text-white/90 transition hover:border-ciano/50 hover:text-white"
                      >
                        {nome}
                      </li>
                    ))}
                  </ul>
                </div>
              </Revelar>
            );
          })}
        </div>
        <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-suave">
          Também dá para ligar qualquer agente compatível com o protocolo ACP ou qualquer API no formato da OpenAI. Os
          nomes acima são marcas dos seus donos e aparecem só para indicar compatibilidade.
        </p>
      </div>
    </section>
  );
}
