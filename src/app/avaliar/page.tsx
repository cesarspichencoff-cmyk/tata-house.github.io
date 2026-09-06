'use client';

/* =====================================================================
   Pesquisa de satisfação do prato do dia (Módulo de feedback / QR).
   Campo único: qualidade (alimenta o índice de aceitação existente).
   Envio simples, sem login.
   ===================================================================== */

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { DIAS_SEMANA } from '@/lib/cardapio/texto';
import {
  assinarChaveExterna,
  idSemanaIso,
  lerCardapioDoDia,
  registrarVotoCliente,
  type CardapioDoDia,
} from '@/lib/cardapio/avaliar-cliente';
import { lerCardapioGovernancaLocal } from '@/lib/cardapio/governanca-cardapio';
import { instalarHandoffCardapioGovernanca } from '@/lib/cardapio/governanca-handoff';
import { registrarAvaliacaoGovernancaPendente } from '@/lib/cardapio/governanca-outbox';

type Voto = 'bom' | 'ok' | 'ruim';

const OPCOES: { v: Voto; emoji: string; rotulo: string }[] = [
  { v: 'bom', emoji: '😋', rotulo: 'Ótimo' },
  { v: 'ok', emoji: '😐', rotulo: 'Regular' },
  { v: 'ruim', emoji: '👎', rotulo: 'Ruim' },
];

const COR_VOTO: Record<Voto, string> = {
  bom: 'bg-brand-500/20 ring-brand-500/50 text-brand-700 dark:text-brand-200',
  ok: 'bg-ouro-400/20 ring-ouro-400/50 text-ouro-700 dark:text-ouro-200',
  ruim: 'bg-[#c96a5f]/20 ring-[#c96a5f]/40 text-perigo dark:text-perigo-claro',
};

function BotaoVoto({
  op,
  selecionado,
  onClick,
}: {
  op: (typeof OPCOES)[number];
  selecionado: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-1 rounded-2xl px-3 py-3 ring-1 transition active:scale-95 ${
        selecionado
          ? COR_VOTO[op.v]
          : 'bg-white/10 ring-white/20 hover:bg-white/20 text-white'
      }`}
    >
      <span className="text-3xl">{op.emoji}</span>
      <span className="text-caption font-bold uppercase tracking-wide">{op.rotulo}</span>
    </button>
  );
}

function SecaoAvaliacao({
  titulo,
  valor,
  onChange,
}: {
  titulo: string;
  valor: Voto | null;
  onChange: (v: Voto) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-rotulo font-extrabold uppercase tracking-[0.2em] text-brand-200">{titulo}</p>
      <div className="flex gap-2">
        {OPCOES.map((op) => (
          <BotaoVoto
            key={op.v}
            op={op}
            selecionado={valor === op.v}
            onClick={() => onChange(op.v)}
          />
        ))}
      </div>
    </div>
  );
}

export default function PaginaAvaliar() {
  const hoje = new Date();
  const semanaId = idSemanaIso(hoje);
  const diaIdx = (hoje.getDay() + 6) % 7;

  // Lê o cardápio do dia no cliente (evita mismatch de hidratação).
  const [cardapio, setCardapio] = useState<CardapioDoDia | null>(null);
  const [pronto, setPronto] = useState(false);
  const [enviado, setEnviado] = useState(false);

  const [qualidade, setQualidade] = useState<Voto | null>(null);
  const [comentario, setComentario] = useState('');

  useEffect(() => {
    const atualizar = () => {
      // Se um canal autorizado já entregou o snapshot da Governança, ele ganha
      // precedência. Sem snapshot, o House continua exatamente como antes.
      // Não há rede, endpoint ou dependência de Supabase nesta decisão.
      const governanca = lerCardapioGovernancaLocal(new Date());
      setCardapio(
        governanca
          ? {
              principal: governanca.principal,
              guarnicao: governanca.guarnicao,
              salada: governanca.salada,
            }
          : lerCardapioDoDia(semanaId, diaIdx),
      );
      setPronto(true);
    };

    atualizar();
    const pararChaveExterna = assinarChaveExterna('semana.' + semanaId, atualizar);
    const pararHandoff = instalarHandoffCardapioGovernanca(() => atualizar());

    return () => {
      pararChaveExterna();
      pararHandoff();
    };
  }, [semanaId, diaIdx]);

  const prato = cardapio?.principal;

  useEffect(() => {
    if (!enviado) return;
    const t = setTimeout(() => setEnviado(false), 5000);
    return () => clearTimeout(t);
  }, [enviado]);

  const podeSalvar = qualidade !== null;

  const enviar = () => {
    if (!prato || !qualidade) return;
    try {
      navigator.vibrate?.(15);
    } catch {
      /* sem suporte */
    }

    const voto = qualidade;
    const textoComentario = comentario;

    // 1) House primeiro: aceitação + termômetro + memória continuam intactos.
    registrarVotoCliente(prato, voto, textoComentario);

    // 2) Contrato da Governança: persistência LOCAL, sem HTTP/Supabase.
    // Um transporte futuro confirma IDs individualmente e só então limpa a fila.
    registrarAvaliacaoGovernancaPendente({
      data: new Date(),
      prato,
      voto,
      comentario: textoComentario,
    });

    setEnviado(true);
    setQualidade(null);
    setComentario('');
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 bg-gradient-to-b from-brand-800 via-brand-700 to-brand-900 px-6 py-10 text-center text-white">
      <div className="space-y-1">
        <div className="font-display text-sm font-bold uppercase tracking-[0.4em] text-brand-200">Tatá House</div>
        <div className="text-caption font-extrabold uppercase tracking-[0.3em] text-ouro-300">Diga como foi o almoço</div>
      </div>

      {!pronto ? (
        <p className="text-brand-100">Carregando…</p>
      ) : enviado ? (
        <div className="relative flex flex-col items-center gap-3 animate-subir">
          <div className="pointer-events-none absolute left-1/2 top-6 -translate-x-1/2" aria-hidden>
            {Array.from({ length: 16 }).map((_, i) => {
              const cores = ['#00b14f', '#c8a96b', '#2cc468', '#e89a90', '#7cb8d4'];
              const dx = (i - 8) * 13 + (i % 2 ? 7 : -7);
              return (
                <span
                  key={i}
                  className="absolute left-0 top-0 block h-2 w-2 rounded-sm animate-confete"
                  style={{ background: cores[i % cores.length], animationDelay: `${(i % 5) * 40}ms`, '--tx': `${dx}px` } as CSSProperties}
                />
              );
            })}
          </div>
          <span className="animate-estourar text-7xl">😊</span>
          <p className="font-display text-2xl font-bold">Obrigado pelo feedback!</p>
          <p className="text-sm text-brand-100">Sua opinião ajuda a melhorar o cardápio. 💚</p>
        </div>
      ) : !prato ? (
        <div className="space-y-2">
          <span className="text-6xl">🍽️</span>
          <p className="font-display text-2xl font-bold">Cardápio de hoje a definir</p>
          <p className="text-sm text-brand-100">Volte na hora do almoço para avaliar o prato do dia.</p>
        </div>
      ) : (
        <div className="w-full max-w-md space-y-6">
          {/* Cabeçalho do prato */}
          <div className="space-y-1">
            <p className="text-caption font-extrabold uppercase tracking-[0.25em] text-brand-200">
              {DIAS_SEMANA[diaIdx]} · prato do dia
            </p>
            <h1 className="font-display text-3xl font-black uppercase leading-tight sm:text-4xl">{prato}</h1>
            {cardapio && [cardapio.guarnicao, cardapio.salada].filter(Boolean).length > 0 && (
              <p className="text-sm font-semibold uppercase tracking-wide text-brand-100">
                {[cardapio.guarnicao, cardapio.salada].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          {/* Avaliação única + comentário */}
          <div className="space-y-5 rounded-3xl bg-white/10 p-5 ring-1 ring-white/20 text-left">
            <SecaoAvaliacao titulo="Como está o prato de hoje?" valor={qualidade} onChange={setQualidade} />

            {/* Comentário livre */}
            <div className="space-y-2">
              <p className="text-rotulo font-extrabold uppercase tracking-[0.2em] text-brand-200">
                💬 Comentário livre
              </p>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                placeholder="Sugestão, elogio ou crítica… (opcional)"
                rows={3}
                className="w-full resize-none rounded-xl bg-white/10 px-3 py-2.5 text-sm text-white placeholder:text-brand-200/50 ring-1 ring-white/20 focus:outline-none focus:ring-white/40"
              />
            </div>
          </div>

          <button
            onClick={enviar}
            disabled={!podeSalvar}
            className={`w-full rounded-3xl px-6 py-5 text-lg font-extrabold uppercase tracking-wide shadow-flutuante ring-1 ring-white/20 transition active:scale-95 ${
              podeSalvar
                ? 'bg-gradient-to-r from-brand-500 to-brand-700 text-white'
                : 'cursor-not-allowed bg-white/10 text-white/40'
            }`}
          >
            Enviar avaliação
          </button>
        </div>
      )}
    </main>
  );
}