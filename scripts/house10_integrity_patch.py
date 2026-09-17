from pathlib import Path

# Fechamento de verdade/evidência: lançamento manual continua no livro-caixa,
# mas só documento com origem='nf' pode alimentar o KPI "Notas fiscais" como comprovado.
p = Path('src/lib/cardapio/inteligencia-viva.ts')
s = p.read_text(encoding='utf-8')
old = """  const nfsSemana = entrada.lancamentos.filter((l) => datas.has(l.data));
  const totalNf = nfsSemana.reduce((s, l) => s + Math.max(0, l.total), 0);
"""
new = """  const nfsSemana = entrada.lancamentos.filter((l) => datas.has(l.data) && l.origem === 'nf');
  const totalNf = nfsSemana.reduce((s, l) => s + Math.max(0, l.total), 0);
"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit('NF evidence anchor not found')
p.write_text(s, encoding='utf-8')

p = Path('src/lib/cardapio/inteligencia-viva.test.ts')
s = p.read_text(encoding='utf-8')
anchor = """  it('compara demanda somente nos dias com realizado e explicita cobertura parcial', () => {
"""
test = """  it('não classifica lançamento manual como nota fiscal comprovada', () => {
    const r = construirInteligenciaViva({
      ...entrada(),
      lancamentos: [
        { id: 'm1', data: '2026-09-15', fornecedor: 'Ajuste manual', total: 321, itens: [], origem: 'manual' as const, em: '2026-09-15T11:00:00Z' },
      ],
    });
    expect(r.notasFiscais.valor).toBeNull();
    expect(r.notasFiscais.classe).toBe('indisponivel');
    expect(r.notasFiscais.coberturaPct).toBe(0);
  });

"""
if "não classifica lançamento manual como nota fiscal comprovada" not in s:
    if anchor not in s:
        raise SystemExit('test insertion anchor not found')
    s = s.replace(anchor, test + anchor, 1)
p.write_text(s, encoding='utf-8')
