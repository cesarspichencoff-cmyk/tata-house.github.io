import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'TATÁ House — Ponte de Governança',
  robots: { index: false, follow: false },
};

/**
 * Superfície técnica mínima para o postMessage read-only da Governança.
 * O responder e o BootNuvem vivem no layout global; esta rota evita carregar
 * a interface operacional completa do House dentro do iframe dos Líderes.
 */
export default function GovernancaBridgePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-sm text-carvao-500 dark:bg-carvao-950 dark:text-carvao-400">
      TATÁ House · ponte de leitura para Governança
    </main>
  );
}
