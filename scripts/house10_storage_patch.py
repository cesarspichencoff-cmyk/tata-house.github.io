from pathlib import Path

# ---------------------------------------------------------------------
# estado.tsx: reidrata anexos do IndexedDB e evita blobs no localStorage
# quando a nuvem estiver desativada.
# ---------------------------------------------------------------------
p = Path('src/lib/cardapio/estado.tsx')
s = p.read_text()

anchor_import = "import { registrarVersao } from './historico-semana';\n"
assert anchor_import in s, 'import historico-semana não encontrado'
s = s.replace(
    anchor_import,
    anchor_import + "import { estadoSemAnexosSemana, hidratarAnexosSemana, persistirAnexosSemana } from './anexos-semana';\n",
    1,
)

old_gravar = """function gravarLocal(chave: string, valor: unknown) {
  try {
    const resultado = gravarComRecuperacaoDeQuota(
      localStorage,
      PREFIXO + chave,
      JSON.stringify(valor),
    );"""
new_gravar = """function gravarLocal(chave: string, valor: unknown) {
  try {
    let valorCache = valor;
    // Sem nuvem, o próprio estado mantém os anexos grandes no IndexedDB.
    // Com nuvem, BootNuvem preserva o payload completo no upload e grava só
    // a forma compacta no cache local.
    if (!supabaseHabilitado() && chave.startsWith('semana.') && valor && typeof valor === 'object') {
      const semana = valor as EstadoSemana;
      void persistirAnexosSemana(chave, semana);
      valorCache = estadoSemAnexosSemana(semana);
    }
    const resultado = gravarComRecuperacaoDeQuota(
      localStorage,
      PREFIXO + chave,
      JSON.stringify(valorCache),
    );"""
assert old_gravar in s, 'gravarLocal não encontrado'
s = s.replace(old_gravar, new_gravar, 1)

old_recarregar = """  const recarregar = useCallback(() => {
    setEstado(lerLocal('semana.' + semanaId, semanaVazia()));
  }, [semanaId]);"""
new_recarregar = """  const recarregar = useCallback(() => {
    const chave = 'semana.' + semanaId;
    const local = lerLocal(chave, semanaVazia());
    setEstado(local);
    // Fotos antigas/legadas ficam fora do localStorage. Reidrata em segundo
    // plano sem permitir que uma leitura atrasada sobrescreva uma edição que
    // aconteceu depois do primeiro paint.
    void hidratarAnexosSemana(chave, local).then((hidratado) => {
      setEstado((atual) => {
        const baseAindaIgual = JSON.stringify(estadoSemAnexosSemana(atual)) === JSON.stringify(estadoSemAnexosSemana(local));
        return baseAindaIgual ? hidratado : atual;
      });
    });
  }, [semanaId]);"""
assert old_recarregar in s, 'recarregar useSemana não encontrado'
s = s.replace(old_recarregar, new_recarregar, 1)
p.write_text(s)

# ---------------------------------------------------------------------
# BootNuvem: nuvem recebe documento COMPLETO; localStorage guarda versão
# leve; IndexedDB preserva anexos do aparelho.
# ---------------------------------------------------------------------
p = Path('src/components/BootNuvem.tsx')
s = p.read_text()

anchor_import = "import { registrarVersao } from '@/lib/cardapio/historico-semana';\n"
assert anchor_import in s, 'import registrarVersao não encontrado'
s = s.replace(
    anchor_import,
    anchor_import + "import { estadoSemAnexosSemana, hidratarAnexosSemana, persistirAnexosSemana } from '@/lib/cardapio/anexos-semana';\n",
    1,
)

old_local_write = """        let erroLocal: unknown = null;
        try {
          orig(chave, valor);
        } catch (e) {
          erroLocal = e;
        }

        if (ehTata && !k.startsWith('__')) {"""
new_local_write = """        let erroLocal: unknown = null;
        let valorCache = valor;
        if (ehTata && k.startsWith('semana.')) {
          try {
            const semanaCompleta = JSON.parse(valor) as EstadoSemana;
            void persistirAnexosSemana(k, semanaCompleta);
            valorCache = JSON.stringify(estadoSemAnexosSemana(semanaCompleta));
          } catch { /* payload não-JSON segue normal */ }
        }
        try {
          orig(chave, valorCache);
        } catch (e) {
          erroLocal = e;
        }

        if (ehTata && !k.startsWith('__')) {"""
assert old_local_write in s, 'escrita local do BootNuvem não encontrada'
s = s.replace(old_local_write, new_local_write, 1)

old_base = """    const gravarBase = (chave: string, valor: unknown) => {
      try { orig(PREFIXO + '__base.' + chave, JSON.stringify(valor)); } catch { /* cheio */ }
    };"""
new_base = """    const gravarBase = (chave: string, valor: unknown) => {
      try {
        const valorCache = chave.startsWith('semana.') && valor && typeof valor === 'object'
          ? estadoSemAnexosSemana(valor as EstadoSemana)
          : valor;
        orig(PREFIXO + '__base.' + chave, JSON.stringify(valorCache));
      } catch { /* cheio */ }
    };"""
assert old_base in s, 'gravarBase não encontrado'
s = s.replace(old_base, new_base, 1)

old_aplicar = """    const aplicarSemana = (chave: string, remote: EstadoSemana): boolean => {
      const localRaw = localStorage.getItem(PREFIXO + chave);"""
new_aplicar = """    const aplicarSemana = (chave: string, remote: EstadoSemana): boolean => {
      // Arquiva anexos remotos antes de compactar a cópia do navegador.
      // Uma segunda notificação depois da confirmação do IndexedDB permite aos
      // hooks reidratar a foto sem obrigar o localStorage a carregá-la.
      void persistirAnexosSemana(chave, remote).then(() => notificarChaveExterna(chave));
      const localRaw = localStorage.getItem(PREFIXO + chave);"""
assert old_aplicar in s, 'aplicarSemana não encontrado'
s = s.replace(old_aplicar, new_aplicar, 1)

s = s.replace(
    "orig(PREFIXO + chave, JSON.stringify(remote));\n        gravarBase(chave, remote);",
    "orig(PREFIXO + chave, JSON.stringify(estadoSemAnexosSemana(remote)));\n        gravarBase(chave, remote);",
    1,
)
s = s.replace(
    "orig(PREFIXO + chave, JSON.stringify(merged));\n        notificarChaveExterna(chave);",
    "void persistirAnexosSemana(chave, merged);\n        orig(PREFIXO + chave, JSON.stringify(estadoSemAnexosSemana(merged)));\n        notificarChaveExterna(chave);",
    1,
)

old_push = """              subir(k, JSON.parse(raw));
            } catch { /* não-JSON */ }"""
new_push = """              const localJson = JSON.parse(raw);
              const valorSubir = k.startsWith('semana.')
                ? await hidratarAnexosSemana(k, localJson as EstadoSemana)
                : localJson;
              subir(k, valorSubir);
            } catch { /* não-JSON */ }"""
assert old_push in s, 'push de chave local-only não encontrado'
s = s.replace(old_push, new_push, 1)
p.write_text(s)
