'use client';

import { useEffect, useState } from 'react';
import { interpretarQuantidadeCompra, textoQuantidadeCompra } from '@/lib/cardapio/quantidade-compra';

export function CampoQuantidadeCompra({
  valor,
  aoConfirmar,
  ariaLabel,
  className,
}: {
  valor: number;
  aoConfirmar: (valor: number) => void;
  ariaLabel: string;
  className?: string;
}) {
  const [rascunho, setRascunho] = useState(() => textoQuantidadeCompra(valor));
  const [editando, setEditando] = useState(false);

  useEffect(() => {
    if (!editando) setRascunho(textoQuantidadeCompra(valor));
  }, [valor, editando]);

  const confirmar = () => {
    const quantidade = interpretarQuantidadeCompra(rascunho);
    setEditando(false);
    if (quantidade === null) {
      setRascunho(textoQuantidadeCompra(valor));
      return;
    }
    setRascunho(textoQuantidadeCompra(quantidade));
    if (quantidade !== valor) aoConfirmar(quantidade);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      aria-label={ariaLabel}
      value={rascunho}
      onFocus={(e) => {
        setEditando(true);
        e.currentTarget.select();
      }}
      onChange={(e) => setRascunho(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
      }}
      className={className}
    />
  );
}
