import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-24 text-center">
      <h1 className="text-2xl font-semibold text-white">Página não encontrada</h1>
      <p className="mt-2 text-muted">Este andar ainda não existe no prédio.</p>
      <Link to="/" className="btn btn-primary mt-6">
        Voltar ao prédio
      </Link>
    </main>
  );
}
