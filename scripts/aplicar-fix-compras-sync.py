from pathlib import Path


def substituir_unico(path: str, antigo: str, novo: str) -> None:
    arquivo = Path(path)
    texto = arquivo.read_text(encoding='utf-8')
    if novo in texto:
        return
    ocorrencias = texto.count(antigo)
    if ocorrencias != 1:
        raise SystemExit(f'{path}: esperado 1 trecho, encontrado {ocorrencias}')
    arquivo.write_text(texto.replace(antigo, novo, 1), encoding='utf-8')


lista = 'src/components/cardapio/ListaCompras.tsx'
substituir_unico(
    lista,
    "import { Icone } from '@/components/Icones';\n",
    "import { Icone } from '@/components/Icones';\nimport { CampoQuantidadeCompra } from './CampoQuantidadeCompra';\n",
)

substituir_unico(
    lista,
    '''                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            value={l.qtd}
                            onChange={(e) =>
                              l.manual
                                ? onEditManual?.(di, Number(l.chave.split(':')[1]), { qtd: Number(e.target.value) })
                                : onAjuste!(di, l.chave, Number(e.target.value))
                            }
                            className="h-9 w-16 rounded-lg border border-carvao-200 bg-white px-1.5 text-center font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                          />''',
    '''                          <CampoQuantidadeCompra
                            valor={l.qtd}
                            ariaLabel={`Quantidade de ${l.item}`}
                            aoConfirmar={(qtd) =>
                              l.manual
                                ? onEditManual?.(di, Number(l.chave.split(':')[1]), { qtd })
                                : onAjuste!(di, l.chave, qtd)
                            }
                            className="h-9 w-16 rounded-lg border border-carvao-200 bg-white px-1.5 text-center font-bold tabular-nums dark:border-carvao-600 dark:bg-carvao-900"
                          />''',
)

merge = 'src/lib/cardapio/merge-semana.ts'
ancora = '''const mapaDeMapa = <V>(
  base: Record<string, Record<string, V>> | undefined,
  local: Record<string, Record<string, V>>,
  remote: Record<string, Record<string, V>>,
) => mergeMapa(base, local, remote, (b, l, r) => mergeMapa(b ?? {}, l, r, folha));
'''

helper = ancora + '''
const AUSENTE_AJUSTE = Symbol('ausente-ajuste');
type CampoAjuste = number | boolean | string | typeof AUSENTE_AJUSTE;
const CAMPOS_AJUSTE = ['qtd', 'removido', 'unidOverride', 'obs'] as const;

function lerCampoAjuste(ajuste: AjusteItem | undefined, campo: keyof AjusteItem): CampoAjuste {
  if (!ajuste || !Object.prototype.hasOwnProperty.call(ajuste, campo)) return AUSENTE_AJUSTE;
  return ajuste[campo] as number | boolean | string;
}

function camposAjusteIguais(a: CampoAjuste, b: CampoAjuste): boolean {
  if (a === AUSENTE_AJUSTE || b === AUSENTE_AJUSTE) return a === b;
  return ig(a, b);
}

function resolverCampoAjuste(
  baseConhecida: boolean,
  base: CampoAjuste,
  local: CampoAjuste,
  remote: CampoAjuste,
): CampoAjuste {
  if (camposAjusteIguais(local, remote)) return remote;
  if (baseConhecida && camposAjusteIguais(local, base)) return remote;
  if (baseConhecida && camposAjusteIguais(remote, base)) return local;
  return remote;
}

/** Quantidade, exclusão, unidade e observação são decisões independentes.
 * Duas pessoas podem alterar campos diferentes do mesmo item sem uma ação
 * apagar a outra. Conflito no MESMO campo mantém a regra global: remoto vence. */
function mesclarAjuste(
  baseConhecida: boolean,
  base: AjusteItem | undefined,
  local: AjusteItem,
  remote: AjusteItem,
): AjusteItem {
  const saida: AjusteItem = {};
  for (const campo of CAMPOS_AJUSTE) {
    const valor = resolverCampoAjuste(
      baseConhecida,
      lerCampoAjuste(base, campo),
      lerCampoAjuste(local, campo),
      lerCampoAjuste(remote, campo),
    );
    if (valor === AUSENTE_AJUSTE) continue;
    if (campo === 'qtd' && typeof valor === 'number') saida.qtd = valor;
    if (campo === 'removido' && typeof valor === 'boolean') saida.removido = valor;
    if (campo === 'unidOverride' && typeof valor === 'string') saida.unidOverride = valor;
    if (campo === 'obs' && typeof valor === 'string') saida.obs = valor;
  }
  return saida;
}

function mergeAjustes(
  baseConhecida: boolean,
  base: Record<string, Record<string, AjusteItem>> | undefined,
  local: Record<string, Record<string, AjusteItem>>,
  remote: Record<string, Record<string, AjusteItem>>,
): Record<string, Record<string, AjusteItem>> {
  return mergeMapa(base, local, remote, (b, l, r) =>
    mergeMapa(b ?? {}, l, r, (bb, ll, rr) => mesclarAjuste(baseConhecida, bb, ll, rr)),
  );
}
'''
substituir_unico(merge, ancora, helper)

substituir_unico(
    merge,
    '''    ajustes: mapaDeMapa(
      base?.ajustes as Record<string, Record<string, AjusteItem>> | undefined,
      (local.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
      (remote.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
    ) as unknown as EstadoSemana['ajustes'],''',
    '''    ajustes: mergeAjustes(
      base !== null,
      base?.ajustes as Record<string, Record<string, AjusteItem>> | undefined,
      (local.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
      (remote.ajustes ?? {}) as Record<string, Record<string, AjusteItem>>,
    ) as unknown as EstadoSemana['ajustes'],''',
)

print('hotfix aplicado')
