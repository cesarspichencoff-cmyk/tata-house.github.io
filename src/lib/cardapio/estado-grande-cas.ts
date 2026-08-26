export interface VersaoRemota {
  existe: boolean;
  atualizadoEm: string | null;
}

export interface RegistroVersionado<T> extends VersaoRemota {
  valor: T | null;
}

export interface ResultadoCas<T> {
  valor: T;
  tentativas: number;
}

/**
 * Read -> merge -> compare-and-swap.
 *
 * Se outro cliente vencer a escrita depois da leitura, `tentarGravar`
 * retorna false; a função relê o remoto, mescla de novo e só confirma
 * quando a versão observada ainda é a versão gravada.
 */
export async function gravarMescladoComCas<T>(
  local: T,
  ler: () => Promise<RegistroVersionado<unknown>>,
  tentarGravar: (valor: T, versaoEsperada: VersaoRemota) => Promise<boolean>,
  validar: (valor: unknown) => valor is T,
  mesclar: (local: T, remoto: T) => T,
  maxTentativas = 5,
): Promise<ResultadoCas<T>> {
  if (!Number.isInteger(maxTentativas) || maxTentativas < 1) {
    throw new Error('maxTentativas deve ser >= 1');
  }

  for (let tentativa = 1; tentativa <= maxTentativas; tentativa += 1) {
    const remoto = await ler();

    let combinado = local;
    if (remoto.existe) {
      if (!validar(remoto.valor)) {
        throw new Error('Estado grande remoto inválido; escrita bloqueada');
      }
      combinado = mesclar(local, remoto.valor);
    }

    const confirmou = await tentarGravar(combinado, {
      existe: remoto.existe,
      atualizadoEm: remoto.atualizadoEm,
    });

    if (confirmou) {
      return { valor: combinado, tentativas: tentativa };
    }
  }

  throw new Error(`Concorrência persistente: CAS falhou após ${maxTentativas} tentativa(s)`);
}
