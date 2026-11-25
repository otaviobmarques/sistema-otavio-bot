import { Logo } from '@/components/Logo';

export default function NaoEncontrada() {
  return (
    <main className="grid min-h-screen place-items-center px-6 text-center">
      <div>
        <Logo className="mx-auto h-10 w-auto" />
        <h1 className="mt-10 font-display text-4xl font-bold">Página não encontrada</h1>
        <p className="mt-3 text-suave">O endereço que você abriu não existe ou mudou de lugar.</p>
        <a
          href="/"
          className="mt-8 inline-flex rounded-full bg-ciano px-6 py-3 font-semibold text-noite transition hover:brightness-110"
        >
          Voltar ao início
        </a>
      </div>
    </main>
  );
}
