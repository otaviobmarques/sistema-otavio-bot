import { cn } from "@/lib/cn";
import type { MausState } from "@/lib/mascot";
import { personagemImagem, personagemMotion } from "@/lib/personagens";
import type { Personagem } from "../../shared/personagens";

export function PersonagemAvatar({ personagem, size = 44, state = "idle", animated = true, label, className }: {
  personagem: Personagem;
  size?: number;
  state?: MausState;
  animated?: boolean;
  label?: string | null;
  className?: string;
}) {
  const imagem = personagemImagem(personagem, size);
  const motion = personagemMotion(state);
  return (
    <span
      role={label ? "img" : undefined}
      aria-hidden={label ? undefined : true}
      aria-label={label ?? undefined}
      title={label ?? undefined}
      data-personagem={personagem.id}
      data-personagem-recorte={imagem?.recorte}
      data-personagem-state={state}
      className={cn("personagem-tile relative block shrink-0 overflow-hidden", className)}
      style={{ width: size, height: size, borderRadius: (size * 11) / 48, background: personagem.tile }}
    >
      {imagem && (
        <img
          src={imagem.src}
          srcSet={imagem.srcSet}
          sizes={`${size}px`}
          alt=""
          width={size}
          height={size}
          draggable={false}
          decoding="async"
          className={cn(
            "block size-full max-w-none select-none",
            motion === "dim" && "personagem-dim",
            motion === "bob" && animated && "personagem-bob",
          )}
        />
      )}
    </span>
  );
}
