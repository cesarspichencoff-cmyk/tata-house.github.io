from pathlib import Path

ROOT = Path('.')


def replace_one(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    return text.replace(old, new, 1)


def patch(path: str, operations):
    p = ROOT / path
    text = p.read_text(encoding='utf-8')
    original = text
    for label, old, new in operations:
        text = replace_one(text, old, new, f'{path}::{label}')
    if text == original:
        raise SystemExit(f'{path}: no changes produced')
    p.write_text(text, encoding='utf-8')
    print(f'PATCHED {path}')


patch('src/components/BottomNav.tsx', [
    ('nav labels', """export const GRUPOS: Grupo[] = [
  { id: 'painel',   rotulo: 'Início',     abas: ['agora']      },
  { id: 'cardapio', rotulo: 'Cardápio',   abas: ['cardapio']   },
  { id: 'compras',  rotulo: 'Compras',    abas: ['compras']    },
  { id: 'insights', rotulo: 'Relatórios', abas: ['relatorios'] },
  { id: 'ajustes',  rotulo: 'Ajustes',    abas: ['ajustes']    },
];""", """export const GRUPOS: Grupo[] = [
  { id: 'painel',   rotulo: 'Hoje',      abas: ['agora']      },
  { id: 'cardapio', rotulo: 'Planejar',  abas: ['cardapio']   },
  { id: 'compras',  rotulo: 'Abastecer', abas: ['compras']    },
  { id: 'insights', rotulo: 'Analisar',  abas: ['relatorios'] },
  { id: 'ajustes',  rotulo: 'Gestão',    abas: ['ajustes']    },
];"""),
])

patch('src/lib/cardapio/login.ts', [
    ('gerencia description', "descricao: 'Acesso completo: início, cardápio, compras, relatórios e ajustes'", "descricao: 'Acesso completo: hoje, planejamento, abastecimento, análise e gestão'"),
    ('compras description', "descricao: 'Lista de compras, estoque e preços'", "descricao: 'Abastecimento: necessidades, estoque, preços, notas e pedidos'"),
    ('cozinha description', "descricao: 'Cardápio, conferência, recebimento e feedback'", "descricao: 'Execução: cardápio da semana, conferência, recebimento e feedback'"),
])

patch('src/app/page.tsx', [
    ('top navigation labels', """const ABAS = [
  { id: 'agora',      rotulo: 'Início'     },
  { id: 'cardapio',   rotulo: 'Cardápio'   },
  { id: 'compras',    rotulo: 'Compras'    },
  { id: 'relatorios', rotulo: 'Relatórios' },
  { id: 'ajustes',    rotulo: 'Ajustes'    },
] as const;
type AbaId = (typeof ABAS)[number]['id'];""", """const ABAS = [
  { id: 'agora',      rotulo: 'Hoje'      },
  { id: 'cardapio',   rotulo: 'Planejar'  },
  { id: 'compras',    rotulo: 'Abastecer' },
  { id: 'relatorios', rotulo: 'Analisar'  },
  { id: 'ajustes',    rotulo: 'Gestão'    },
] as const;
type AbaId = (typeof ABAS)[number]['id'];

const AREA_META: Record<AbaId, { kicker: string; titulo: string; descricao: string }> = {
  agora: {
    kicker: 'Visão da semana',
    titulo: 'Hoje',
    descricao: 'Prioridades, alertas e decisões que precisam de atenção agora.',
  },
  cardapio: {
    kicker: 'Do plano à aprendizagem',
    titulo: 'Planejamento',
    descricao: 'Componha a semana, acompanhe a execução e feche o ciclo com feedback.',
  },
  compras: {
    kicker: 'Abastecimento',
    titulo: 'Compras e estoque',
    descricao: 'Transforme o plano em necessidades, pedidos, recebimento e controle de estoque.',
  },
  relatorios: {
    kicker: 'Leitura gerencial',
    titulo: 'Resultados',
    descricao: 'Entenda custo, aceitação, desperdício, tendências e oportunidades de melhoria.',
  },
  ajustes: {
    kicker: 'Administração',
    titulo: 'Gestão do House',
    descricao: 'Organize pessoas, restrições e acessos sem misturar isso com a operação diária.',
  },
};"""),
    ('palette actions', """  const ACOES: { titulo: string; sub: string; chaves: string; run: () => void }[] = [
    { titulo: 'Ir para o cardápio',       sub: 'Montar a semana',     chaves: 'gerar cardapio criar montar semana', run: () => irPara('cardapio') },
    { titulo: 'Abrir cotação / preços',   sub: 'Catálogo de preços',  chaves: 'cotacao preco precos catalogo',      run: () => irPara('cardapio') },
    { titulo: 'Lista de compras',         sub: 'Abrir compras',       chaves: 'lista compras comprar',              run: () => irPara('compras') },
    { titulo: 'Estoque',                  sub: 'Saldos e mínimos',    chaves: 'estoque inventario saldo',           run: () => irPara('compras') },
    { titulo: 'Gerar pedido',             sub: 'Pedido por fornecedor', chaves: 'pedido fornecedor encomenda',      run: () => irPara('compras') },
    { titulo: 'Relatórios e exportação',  sub: 'DNA, custos, rankings', chaves: 'relatorio exportar csv dna ranking', run: () => irPara('relatorios') },
    { titulo: 'Abrir pôster da semana',   sub: 'Arte para imprimir',  chaves: 'poster cartaz imprimir mural',       run: acoes.abrirPoster },
    { titulo: 'Plaquinha de avaliação',   sub: 'QR para as mesas',    chaves: 'plaquinha qr avaliar mesa',          run: acoes.abrirPlaquinha },
    { titulo: 'Duplicar semana anterior', sub: 'Copiar o cardápio',   chaves: 'duplicar copiar semana anterior',    run: acoes.duplicarSemana },
    { titulo: 'Próxima semana',           sub: 'Avançar',             chaves: 'proxima semana avancar',             run: () => acoes.irSemana(1) },
    { titulo: 'Semana anterior',          sub: 'Voltar',              chaves: 'anterior semana voltar',             run: () => acoes.irSemana(-1) },
  ];""", """  const ACOES: { titulo: string; sub: string; chaves: string; run: () => void }[] = [
    { titulo: 'Abrir planejamento',       sub: 'Compor a semana',       chaves: 'gerar cardapio criar montar planejar semana', run: () => irPara('cardapio') },
    { titulo: 'Revisar preços',           sub: 'Custos do planejamento', chaves: 'cotacao preco precos catalogo custo',         run: () => irPara('cardapio') },
    { titulo: 'Ver necessidades',         sub: 'Lista para abastecimento', chaves: 'lista compras comprar necessidade',         run: () => irPara('compras') },
    { titulo: 'Abrir estoque',            sub: 'Saldos e mínimos',       chaves: 'estoque inventario saldo',                   run: () => irPara('compras') },
    { titulo: 'Preparar pedidos',         sub: 'Pedidos por fornecedor', chaves: 'pedido fornecedor encomenda',                run: () => irPara('compras') },
    { titulo: 'Analisar resultados',      sub: 'Custos, qualidade e tendências', chaves: 'relatorio analisar exportar csv dna ranking', run: () => irPara('relatorios') },
    { titulo: 'Abrir pôster da semana',   sub: 'Material de comunicação', chaves: 'poster cartaz imprimir mural',              run: acoes.abrirPoster },
    { titulo: 'Abrir QR de feedback',     sub: 'Avaliação da refeição',  chaves: 'plaquinha qr avaliar mesa feedback',          run: acoes.abrirPlaquinha },
    { titulo: 'Duplicar semana anterior', sub: 'Usar como ponto de partida', chaves: 'duplicar copiar semana anterior',         run: acoes.duplicarSemana },
    { titulo: 'Próxima semana',           sub: 'Avançar',               chaves: 'proxima semana avancar',                      run: () => acoes.irSemana(1) },
    { titulo: 'Semana anterior',          sub: 'Voltar',                chaves: 'anterior semana voltar',                      run: () => acoes.irSemana(-1) },
  ];"""),
    ('search group labels', """const ROTULO_GRUPO: Record<ResultadoBusca['tipo'], string> = {
  acao:       'Ações',
  cardapio:   'Cardápio',
  compra:     'Compras',
  fornecedor: 'Fornecedores',
  relatorio:  'Relatórios',
};""", """const ROTULO_GRUPO: Record<ResultadoBusca['tipo'], string> = {
  acao:       'Ações',
  cardapio:   'Planejamento',
  compra:     'Abastecimento',
  fornecedor: 'Fornecedores',
  relatorio:  'Análise',
};"""),
    ('search placeholder', 'placeholder="Buscar cardápio, ingrediente, fornecedor, relatório…"', 'placeholder="Buscar planejamento, ingrediente, fornecedor, análise…"'),
    ('header subtitle', 'Refeitório do Tatá Sushi', 'Refeitório · planejamento, operação e inteligência'),
    ('area meta binding', """  const grupoAtivo = GRUPOS.find((g) => g.abas.includes(aba)) ?? GRUPOS[0];

  const irSemana""", """  const grupoAtivo = GRUPOS.find((g) => g.abas.includes(aba)) ?? GRUPOS[0];
  const areaMeta = AREA_META[aba];

  const irSemana"""),
    ('remove global output actions', """            <div className="mx-2 h-5 w-px bg-carvao-200 dark:bg-carvao-700" />
            <button
              onClick={() => setPosterAberto(true)}
              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
            >
              <Icone nome="imagem" tam={16} />
              <span className="hidden sm:inline">Pôster</span>
            </button>
            <button
              onClick={() => setPlaquinhaAberta(true)}
              className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
            >
              <Icone nome="cotacao" tam={16} />
              <span className="hidden sm:inline">Plaquinha</span>
            </button>
""", """"""),
    ('contextual area header', """        {/* Desktop: navegação na sidebar à esquerda. Mobile: BottomNav inferior. */}

        {/* ── Conteúdo ─────────────────────────────────────── */}""", """        {/* Desktop: navegação na sidebar à esquerda. Mobile: BottomNav inferior. */}

        {/* ── Contexto da área: uma hierarquia única para todo o produto ── */}
        <section className="flex flex-col gap-3 rounded-2xl border border-carvao-100 bg-white px-4 py-4 shadow-sm dark:border-carvao-800 dark:bg-carvao-900 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-micro font-bold uppercase tracking-[0.16em] text-brand-600 dark:text-brand-400">{areaMeta.kicker}</p>
            <h2 className="mt-1 font-display text-xl font-bold text-carvao-900 dark:text-white sm:text-2xl">{areaMeta.titulo}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-texto-suave">{areaMeta.descricao}</p>
          </div>
          {aba === 'cardapio' && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <button
                onClick={() => setPosterAberto(true)}
                className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
              >
                <Icone nome="imagem" tam={16} /> Pôster
              </button>
              {podeAvaliar && (
                <button
                  onClick={() => setPlaquinhaAberta(true)}
                  className="flex h-9 items-center gap-1.5 whitespace-nowrap rounded-lg border border-carvao-200 bg-white px-3 text-sm font-semibold text-carvao-600 transition hover:bg-carvao-50 dark:border-carvao-700 dark:bg-carvao-900 dark:text-areia-200"
                >
                  <Icone nome="cotacao" tam={16} /> QR de feedback
                </button>
              )}
            </div>
          )}
        </section>

        {/* ── Conteúdo ─────────────────────────────────────── */}"""),
    ('cardapio subnav', """                  {([
                    { id: 'montar' as const,    rotulo: 'Cardápio' },
                    { id: 'operacao' as const,  rotulo: 'Operação' },
                    ...(podeAvaliar ? [{ id: 'avaliacao' as const, rotulo: 'Avaliação' }] : []),
                  ]).map((seg) => (""", """                  {([
                    { id: 'montar' as const,    rotulo: 'Planejamento' },
                    { id: 'operacao' as const,  rotulo: 'Execução' },
                    ...(podeAvaliar ? [{ id: 'avaliacao' as const, rotulo: 'Feedback' }] : []),
                  ]).map((seg) => ("""),
    ('compras subnav labels', """                      {seg === 'lista' ? (
                        <><span className="sm:hidden">Lista</span><span className="hidden sm:inline">Lista de compras</span></>
                      ) : seg === 'estoque' ? 'Estoque'
                      : seg === 'nf' ? (
                        <><span className="sm:hidden">NF</span><span className="hidden sm:inline">Nota fiscal</span></>
                      ) : seg === 'fornecedores' ? (
                        <><span className="sm:hidden">Forn.</span><span className="hidden sm:inline">Fornecedores</span></>
                      ) : 'Pedido'}""", """                      {seg === 'lista' ? (
                        <><span className="sm:hidden">Lista</span><span className="hidden sm:inline">Necessidades</span></>
                      ) : seg === 'estoque' ? 'Estoque'
                      : seg === 'nf' ? (
                        <><span className="sm:hidden">NF</span><span className="hidden sm:inline">Notas fiscais</span></>
                      ) : seg === 'fornecedores' ? (
                        <><span className="sm:hidden">Forn.</span><span className="hidden sm:inline">Fornecedores</span></>
                      ) : 'Pedidos'}"""),
    ('reports subnav', """                    { id: 'gerencial',    rotulo: 'Visão geral',   curto: 'Visão' },
                    { id: 'custos',       rotulo: 'Custos',         curto: 'Custos' },
                    { id: 'rankings',     rotulo: 'DNA & Rankings', curto: 'DNA' },
                    { id: 'previsao',     rotulo: 'Previsão',       curto: 'Prev.' },
                    { id: 'fornecedores', rotulo: 'Fornecedores',   curto: 'Forn.' },
                    { id: 'gastos', rotulo: 'Gastos reais', curto: 'Gastos' },""", """                    { id: 'gerencial',    rotulo: 'Resumo',          curto: 'Resumo' },
                    { id: 'custos',       rotulo: 'Custos',          curto: 'Custos' },
                    { id: 'rankings',     rotulo: 'Qualidade & DNA', curto: 'Qualid.' },
                    { id: 'previsao',     rotulo: 'Previsão',        curto: 'Prev.' },
                    { id: 'fornecedores', rotulo: 'Fornecedores',    curto: 'Forn.' },
                    { id: 'gastos',       rotulo: 'Gastos',           curto: 'Gastos' },"""),
    ('people settings title', '<SecaoAjuste titulo="Equipe e restrições alimentares">', '<SecaoAjuste titulo="Pessoas e restrições">'),
    ('access settings title', '<SecaoAjuste titulo="Configurações de acesso">', '<SecaoAjuste titulo="Acessos e permissões">'),
])

patch('src/components/cardapio/AbaCardapio.tsx', [
    ('operation shortcut hierarchy', """      {/* Atalho: Modo Operação do Dia (foco da cozinha) */}
      <button
        onClick={() => setOpDia(true)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-brand-800 to-brand-600 px-4 py-3 text-left text-white shadow-suave ring-1 ring-ouro-400/40 transition hover:from-brand-900 hover:to-brand-700"
      >
        <span>
          <span className="block text-sm font-extrabold tracking-wide">Operação do Dia</span>
          <span className="block text-caption text-brand-100">O que produzir, receber e comprar hoje — em um toque.</span>
        </span>
        <span className="shrink-0 text-lg">→</span>
      </button>""", """      {/* Atalho operacional: útil, mas subordinado ao planejamento desta tela. */}
      <div className="flex flex-col gap-3 rounded-2xl border border-carvao-200 bg-white px-4 py-3 dark:border-carvao-700 dark:bg-carvao-900 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-micro font-bold uppercase tracking-[0.14em] text-texto-suave">Atalho operacional</p>
          <p className="mt-1 text-sm font-semibold text-carvao-800 dark:text-areia-100">Produção, recebimento e compras de hoje.</p>
        </div>
        <button
          onClick={() => setOpDia(true)}
          className="shrink-0 rounded-xl bg-carvao-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-carvao-700 dark:bg-areia-100 dark:text-carvao-900 dark:hover:bg-white"
        >
          Abrir operação do dia
        </button>
      </div>"""),
    ('generate button label', '<Icone nome="controles" tam={14} /> Gerar cardápio', '<Icone nome="controles" tam={14} /> Criar sugestão'),
    ('generator heading', 'Escolha o modo de geração', 'Estratégia da sugestão'),
    ('generator modes', """              { id: 'historica', icone: 'calendario' as const, titulo: 'Antigo', desc: 'Baseado no histórico da operação' },
              { id: 'economica', icone: 'gerencial' as const,  titulo: 'Mesclado', desc: 'Tradição equilibrada com variedade' },
              { id: 'criativa', icone: 'raio' as const,        titulo: 'Novo', desc: 'Maior liberdade para novas ideias' },""", """              { id: 'historica', icone: 'calendario' as const, titulo: 'Base histórica', desc: 'Recupera combinações que já funcionaram' },
              { id: 'economica', icone: 'gerencial' as const,  titulo: 'Equilíbrio', desc: 'Combina histórico, variedade, aceitação e custo' },
              { id: 'criativa', icone: 'raio' as const,        titulo: 'Exploração', desc: 'Busca novidades sem romper as regras da casa' },"""),
    ('custom generator description', 'Eventos, metas, proteínas, custo…', 'Aplique restrições, metas e preferências'),
    ('historic explanation title', "titulo: 'Cardápio Antigo — por que estes pratos'", "titulo: 'Base histórica — critérios usados'"),
    ('balanced explanation title', "titulo: 'Cardápio Mesclado — por que estes pratos'", "titulo: 'Equilíbrio — critérios usados'"),
    ('exploration explanation title', "titulo: 'Cardápio Novo — por que estes pratos'", "titulo: 'Exploração — critérios usados'"),
    ('custom explanation title', "setExplicacao({ titulo: 'Cardápio Personalizado — o que eu considerei', itens });", "setExplicacao({ titulo: 'Personalizado — critérios usados', itens });"),
    ('custom submit label', 'Gerar cardápio personalizado', 'Criar sugestão personalizada'),
])

patch('src/components/cardapio/PlanejadorGovernanca.tsx', [
    ('waiting title', '<h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Planejador inteligente</h1>', '<h1 className="mt-3 font-display text-3xl font-bold tracking-tight">Planejamento assistido</h1>'),
    ('tab compose', '1. Montar semana', '1. Compor semana'),
    ('tab validate', '2. Decisão por dados', '2. Validar decisão'),
    ('mount helper', 'Use Histórico, Mesclado, Novo ou Personalizado. O motor considera rotação, frequência, aceitação e preços disponíveis; depois você pode ajustar cada dia manualmente.', 'Escolha Base histórica, Equilíbrio, Exploração ou Personalizado. O motor considera rotação, frequência, aceitação e preços disponíveis; a decisão continua ajustável dia a dia.'),
    ('next title', '<h2 className="mt-1 text-lg font-bold">Enviar como rascunho para a Governança</h2>', '<h2 className="mt-1 text-lg font-bold">Enviar proposta para revisão</h2>'),
    ('send button', "{envio === 'enviando' ? 'Enviando…' : 'Enviar para revisão'}", "{envio === 'enviando' ? 'Enviando…' : 'Enviar proposta'}"),
])

print('HOUSE_PRODUCT_ARCHITECTURE_PATCH=PASS')
