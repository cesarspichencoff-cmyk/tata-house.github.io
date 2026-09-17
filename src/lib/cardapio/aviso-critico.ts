import type { StatusNuvem } from './supabase/status';

export function armazenamentoCheioMasConfirmadoNaNuvem(status: StatusNuvem, pendentes: number): boolean {
  return status === 'online' && pendentes === 0;
}

export function mensagemArmazenamentoCheio(status: StatusNuvem, pendentes: number): string {
  const fila =
    pendentes > 0
      ? ` Há ${pendentes} alteração(ões) ainda aguardando confirmação.`
      : '';

  // Cache local cheio NÃO é igual a dado perdido. Quando o próprio motor de
  // sincronização declara online e não existe nenhuma revisão pendente, as
  // alterações operacionais conhecidas já foram confirmadas na nuvem.
  if (armazenamentoCheioMasConfirmadoNaNuvem(status, pendentes)) {
    return (
      'O cache local deste aparelho atingiu o limite, mas as alterações operacionais estão confirmadas na nuvem.' +
      ' Você pode continuar usando o app. O modo offline deste aparelho pode ficar limitado até liberar espaço.' +
      ' Em Ajustes, use “A sincronização está funcionando?” para conferir armazenamento e nuvem.'
    );
  }

  if (status === 'erro') {
    return (
      'O armazenamento local deste aparelho atingiu o limite e a nuvem também está com falha.' +
      fila +
      ' Estados grandes tentam usar o IndexedDB, mas a última alteração não está garantida até a nuvem confirmar. Evite fechar esta tela.'
    );
  }

  if (status === 'desligado') {
    return (
      'O armazenamento local deste aparelho atingiu o limite e este aparelho não está sincronizando.' +
      ' Estados grandes tentam usar o IndexedDB, mas a última alteração pode existir apenas nesta tela. Evite fechar antes de recuperar a sincronização.'
    );
  }

  return (
    'O armazenamento local deste aparelho atingiu o limite.' +
    fila +
    ' Estados grandes tentam usar o IndexedDB, mas uma alteração só deve ser considerada salva depois da confirmação da nuvem. Evite fechar esta tela enquanto houver pendências.'
  );
}
