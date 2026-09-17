from pathlib import Path

# 1) NF em Compras passa a alimentar a mesma verdade financeira do fluxo dedicado,
# sem duplicar quantidade total da NF em cada dia selecionado.
p = Path('src/components/cardapio/AbaCompras.tsx')
s = p.read_text(encoding='utf-8')

s = s.replace(
    "  formatarReais,\n  linhasDoDia,\n} from '@/lib/cardapio/motor';",
    "  formatarReais,\n  linhasDoDia,\n  normalizar,\n} from '@/lib/cardapio/motor';",
    1,
)
if "from '@/lib/cardapio/gastos';" not in s:
    s = s.replace(
        "import { useEstimativas } from '@/lib/cardapio/estimativas';\n",
        "import { useEstimativas } from '@/lib/cardapio/estimativas';\nimport { useGastos } from '@/lib/cardapio/gastos';\n",
        1,
    )

s = s.replace(
    "  const { estimativas } = useEstimativas();\n",
    "  const { estimativas } = useEstimativas();\n  const { registrar: registrarGasto } = useGastos();\n",
    1,
)

s = s.replace(
    "  const [fornecedorNota, setFornecedorNota] = useState('');\n  const [etapaModal, setEtapaModal] = useState<'dias' | 'dados'>('dias');",
    "  const [fornecedorNota, setFornecedorNota] = useState('');\n  const [dataNota, setDataNota] = useState(hojeIso());\n  const [financeiroStatus, setFinanceiroStatus] = useState<'idle' | 'ok' | 'pendente'>('idle');\n  const [etapaModal, setEtapaModal] = useState<'dias' | 'dados'>('dias');",
    1,
)

s = s.replace(
    "  const enviarEmailNota = async (foto: string, itens: typeof itensNota, fornecedor: string) => {",
    "  const enviarEmailNota = async (foto: string, itens: typeof itensNota, fornecedor: string, dataDocumento: string) => {",
    1,
)
s = s.replace(
    "      const data = new Date().toLocaleDateString('pt-BR');",
    "      const data = /^\\d{4}-\\d{2}-\\d{2}$/.test(dataDocumento)\n        ? `${dataDocumento.slice(8, 10)}/${dataDocumento.slice(5, 7)}/${dataDocumento.slice(0, 4)}`\n        : new Date().toLocaleDateString('pt-BR');",
    1,
)

s = s.replace(
    "                    setFornecedorNota('');\n                    setItensNota([{ produto: '', qtd: '', unid: 'kg', precoUnit: '' }]);",
    "                    setFornecedorNota('');\n                    setDataNota(hojeIso());\n                    setFinanceiroStatus('idle');\n                    setItensNota([{ produto: '', qtd: '', unid: 'kg', precoUnit: '' }]);",
    1,
)

email_marker = """          {emailStatus === 'erro' && (
            <p className=\"rounded-xl bg-perigo/10 px-3 py-2 text-rotulo font-bold text-perigo ring-1 ring-perigo/25\">
              Falha no envio do e-mail — verifique a configuração RESEND_API_KEY na Vercel.
            </p>
          )}
"""
if "financeiroStatus === 'ok'" not in s:
    s = s.replace(
        email_marker,
        email_marker + """          {financeiroStatus === 'ok' && (
            <p className=\"rounded-xl bg-brand-500/10 px-3 py-2 text-rotulo font-bold text-brand-700 ring-1 ring-brand-500/30\">
              Valor da nota entrou automaticamente em Relatórios e Gastos.
            </p>
          )}
          {financeiroStatus === 'pendente' && (
            <p className=\"rounded-xl bg-ouro-300/15 px-3 py-2 text-rotulo font-bold text-ouro-700 ring-1 ring-ouro-400/30\">
              Nota salva, mas o valor não entrou como comprovado: informe quantidade e R$/u de todos os itens.
            </p>
          )}
""",
        1,
    )

supplier_input = """                <input
                  className=\"w-full rounded-xl border border-carvao-200 bg-white px-3 py-2 text-sm dark:border-carvao-600 dark:bg-carvao-900\"
                  placeholder=\"Fornecedor / marca (opcional)\"
                  value={fornecedorNota}
                  onChange={(e) => setFornecedorNota(e.target.value)}
                />
"""
if "Data da nota" not in s:
    s = s.replace(
        supplier_input,
        supplier_input + """                <label className=\"block text-rotulo font-semibold text-carvao-500\">
                  Data da nota
                  <input
                    type=\"date\"
                    className=\"mt-1 w-full rounded-xl border border-carvao-200 bg-white px-3 py-2 text-sm dark:border-carvao-600 dark:bg-carvao-900\"
                    value={dataNota}
                    onChange={(e) => setDataNota(e.target.value)}
                  />
                </label>
                <p className=\"text-micro text-texto-suave\">
                  Com quantidade e R$/u preenchidos em todos os itens, esta mesma nota alimenta automaticamente Relatórios e Gastos.
                </p>
""",
        1,
    )

old_confirm = """                      const dias = Array.from(diasDaNota).sort((a, b) => a - b);
                      atualizar((e) => ({
                        ...e,
                        notasFiscais: [...(e.notasFiscais ?? []), { foto: fotoPendente!, dias, em: new Date().toISOString() }],
                      }));
                      // Registra itens nos status
                      const itensValidos = itensNota.filter((it) => it.produto.trim() && Number(it.qtd) > 0);
                      if (itensValidos.length > 0 && dias.length > 0) {
                        const di = dias[0];
                        atualizar((e) => {
                          const novoStatus = { ...(e.status[di] ?? {}) };
                          itensValidos.forEach((it) => {
                            const chave = it.produto.toLowerCase().trim().replace(/\\s+/g, ' ');
                            novoStatus[chave] = {
                              ...(novoStatus[chave] ?? {}),
                              compradoEm: new Date().toISOString().slice(0, 10),
                              compradoQtd: Number(it.qtd),
                              ...(it.precoUnit ? { precoPago: Number(it.precoUnit) } : {}),
                            };
                          });
                          return { ...e, status: { ...e.status, [di]: novoStatus } };
                        });
                      }
                      // Envia e-mail automaticamente
                      await enviarEmailNota(fotoPendente!, itensNota, fornecedorNota);
                      setFotoPendente(null);
"""
new_confirm = """                      const dias = Array.from(diasDaNota).sort((a, b) => a - b);
                      atualizar((e) => ({
                        ...e,
                        notasFiscais: [...(e.notasFiscais ?? []), { foto: fotoPendente!, dias, em: new Date().toISOString() }],
                      }));

                      const itensValidos = itensNota.filter((it) => it.produto.trim() && Number(it.qtd) > 0);
                      if (itensValidos.length > 0 && dias.length > 0) {
                        // A NF pode atender vários dias. Marcamos cada linha planejada correspondente,
                        // usando a quantidade daquele dia — nunca repetindo a quantidade total da NF.
                        atualizar((e) => {
                          const status = { ...e.status };
                          dias.forEach((di) => {
                            const linhas = linhasDoDia(e, di, fatores, { mostrarBasicos });
                            const novoStatus = { ...(status[di] ?? {}) };
                            itensValidos.forEach((it) => {
                              const itemNorm = normalizar(it.produto);
                              const linha = linhas.find((l) => l.chave === itemNorm || normalizar(l.item) === itemNorm);
                              if (!linha) return;
                              const precoPago = Number(it.precoUnit);
                              novoStatus[linha.chave] = {
                                ...(novoStatus[linha.chave] ?? {}),
                                compradoEm: dataNota || hojeIso(),
                                compradoQtd: linha.qtd,
                                ...(precoPago > 0 ? { precoPago } : {}),
                              };
                            });
                            status[di] = novoStatus;
                          });
                          return { ...e, status };
                        });
                      }

                      // O livro-caixa é a fonte da Inteligência Gerencial Viva. Só registramos
                      // como NF comprovada quando todos os itens informados têm valor completo.
                      const itensComValor = itensValidos.filter((it) => Number(it.precoUnit) > 0);
                      if (itensValidos.length > 0 && itensComValor.length === itensValidos.length) {
                        const itensFinanceiros = itensValidos.map((it) => {
                          const qtd = Number(it.qtd);
                          const precoUnit = Number(it.precoUnit);
                          return {
                            produto: it.produto.trim(),
                            norm: normalizar(it.produto),
                            qtd,
                            unid: it.unid,
                            precoUnit,
                            precoTotal: qtd * precoUnit,
                          };
                        });
                        registrarGasto({
                          data: dataNota || hojeIso(),
                          fornecedor: fornecedorNota.trim() || 'Não informado',
                          total: itensFinanceiros.reduce((soma, it) => soma + it.precoTotal, 0),
                          itens: itensFinanceiros,
                          origem: 'nf',
                        });
                        setFinanceiroStatus('ok');
                      } else {
                        setFinanceiroStatus('pendente');
                      }

                      await enviarEmailNota(fotoPendente!, itensNota, fornecedorNota, dataNota || hojeIso());
                      setFotoPendente(null);
"""
if old_confirm in s:
    s = s.replace(old_confirm, new_confirm, 1)
elif "itensFinanceiros" not in s:
    raise SystemExit('NF confirm block anchor not found')

p.write_text(s, encoding='utf-8')

# 2) O workflow semanal deixa de ser "espinha dorsal" global. Mantemos a etapa
# no domínio operacional, sem forçar a navegação inteira a girar em torno dela.
p = Path('src/app/page.tsx')
s = p.read_text(encoding='utf-8')
s = s.replace("import type { Etapa } from '@/lib/cardapio/tipos';\n", "", 1)
start = s.find('/* ── badge de etapa')
end = s.find('/* ── busca global', start)
if start >= 0 and end > start:
    s = s[:start] + s[end:]

old_header = """            <div className=\"mt-2 max-w-xs\">
              <MiniEtapas
                etapa={estado.etapa}
                sufixo={semanaId === semanaAtualId ? 'semana atual' : 'semana planejada'}
              />
            </div>
"""
new_header = """            <p className=\"mt-1 text-rotulo font-semibold text-texto-suave\">
              {semanaId === semanaAtualId ? 'Semana atual' : 'Semana planejada'}
            </p>
"""
if old_header in s:
    s = s.replace(old_header, new_header, 1)
elif 'MiniEtapas' in s:
    raise SystemExit('MiniEtapas usage anchor not found')
p.write_text(s, encoding='utf-8')

# 3) Guarda de coerência: a home não volta a impor um workflow global.
p = Path('src/lib/cardapio/ux-coerencia.test.ts')
s = p.read_text(encoding='utf-8')
needle = "    expect(page).not.toContain('<CopilotoSemana');\n"
if "not.toContain('MiniEtapas')" not in s:
    if needle not in s:
        raise SystemExit('UX test anchor not found')
    s = s.replace(needle, needle + "    expect(page).not.toContain('MiniEtapas');\n", 1)
p.write_text(s, encoding='utf-8')
