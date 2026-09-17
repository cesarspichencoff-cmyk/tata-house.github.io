/* =====================================================================
   Cardápio da equipe (refeição dos funcionários) — tipos do módulo
   ===================================================================== */

export type Categoria = 'principal' | 'guarnicaoFixa' | 'guarnicao' | 'salada' | 'sobremesa';

export type Proteina = 'bovina' | 'frango' | 'suina' | 'peixe' | 'ovo' | 'outros';

export type Papel = 'gestor' | 'cozinha' | 'compras' | 'recebimento' | 'administrador';

export type Etapa = 'rascunho' | 'cozinha' | 'compras' | 'recebimento' | 'concluido';

export interface DiaCardapio {
  pessoas: number;
  principal: string;
  guarnicaoFixa: string;
  guarnicao: string;
  salada: string;
  sobremesa: string;
}

/**
 * Origem de cada item da lista de compras.
 * operacional_combo — saiu de um combo exato do dados.json
 * operacional_mapa  — saiu de um mapa de componente do dados.json
 * receita           — veio da biblioteca de receitas (gap-fill ou prato sem histórico)
 * fallback          — completado por heurística de texto/proteína padrão
 * aprendido_app     — recorrência observada nas listas realmente ajustadas no app
 */
export type FonteItem = 'operacional_combo' | 'operacional_mapa' | 'receita' | 'fallback' | 'aprendido_app';

/** Item sugerido pelo motor para a compra de um dia. */
export interface ItemSugerido {
  item: string;
  unid: string;
  /** Quantidade histórica (baseline de pessoas) já escalada para o dia. */
  qtd: number;
  /** Rastreabilidade: de onde este item veio. */
  fonte: FonteItem;
}

/** Ajuste manual feito por cima da sugestão (chave = item normalizado). */
export interface AjusteItem {
  qtd?: number;
  removido?: boolean;
  unidOverride?: string;
  obs?: string;
}

/** Feedback do usuário sobre uma sugestão do Chef IA. */
export interface ChefFeedback {
  id: string;
  hash: string;
  voto: 'bom' | 'ruim';
  motivo?: string;
  em: string;
}

/** Item identificado numa nota fiscal fotografada. */
export interface ItemNota {
  produto: string;
  qtd: number;
  unid: string;
  precoUnit: number;
  fornecedor?: string;
}

/** Item digitado fora da lógica automática. */
export interface ItemManual {
  item: string;
  unid: string;
  qtd: number;
}

/** Andamento de um item dentro do fluxo de compra/recebimento. */
export interface StatusItem {
  compradoQtd?: number;
  compradoEm?: string; // data da compra (ISO yyyy-mm-dd)
  precoPago?: number; // R$ por unidade efetivamente cobrado (vs. cotado)
  previsao?: string; // previsão de entrega
  recebidoQtd?: number;
  recebidoOk?: boolean;
}

export interface RegistroEtapa {
  etapa: Etapa;
  em: string; // ISO datetime
  papel: Papel;
}

/** Nota fiscal fotografada — uma compra pode cobrir vários dias. */
export interface NotaFiscal {
  foto: string; // dataURL comprimida
  dias: number[]; // índices dos dias (0=segunda … 6=domingo)
  em: string; // quando foi anexada (ISO)
}

export interface EstadoSemana {
  versao: 1;
  /** v2 = composição aprendida habilitada somente para listas novas; ausente = lista legada congelada. */
  listaInteligenciaVersao?: 2;
  orcamento: number | null;
  dias: DiaCardapio[]; // 7 posições, segunda a domingo
  etapa: Etapa;
  historico: RegistroEtapa[];
  /** ajustes[diaIdx][itemNormalizado] */
  ajustes: Record<number, Record<string, AjusteItem>>;
  /** manuais[diaIdx] */
  manuais: Record<number, ItemManual[]>;
  /** status[diaIdx][itemNormalizado] */
  status: Record<number, Record<string, StatusItem>>;
  obsCozinha: string;
  /** refeições servidas de fato em cada dia (contagem das meninas) */
  refeicoes?: Record<number, number>;
  /** foto da nota fiscal do dia (modelo antigo — mantido por compatibilidade) */
  notas?: Record<number, string>;
  /** notas fiscais da semana, cada uma vinculada aos dias que cobre */
  notasFiscais?: NotaFiscal[];
}

export interface Aviso {
  nivel: 'ok' | 'alerta' | 'erro';
  msg: string;
}

/* ---- formato do dados.json (extraído da planilha histórica) ---- */

export interface DadosItem {
  n: string;
  u: string;
  f: number;
}

export interface DadosCombo {
  chave: string;
  p: string | null;
  gf: string | null;
  g: string | null;
  s: string | null;
  sb: string | null;
  occ: number;
  itens: { i: string; q: number; u: string | null }[];
}

export interface DadosMapa {
  tipo: 'principal' | 'guarnicao_fixa' | 'guarnicao' | 'salada' | 'sobremesa';
  op: string;
  itens: { i: string; q: number; u: string | null }[];
}

export interface DadosCardapio {
  baseline: number;
  itens: DadosItem[];
  combos: DadosCombo[];
  mapas: DadosMapa[];
  listas: {
    principais: string[];
    guarnicoesFixas: string[];
    guarnicoes: string[];
    saladas: string[];
    sobremesas: string[];
  };
  excluir: string[];
  unidades: string[];
}

/* =====================================================================
   Camada corporativa — estoque, desperdício, aceitação, preço, auditoria,
   eventos de demanda e organização (multi-tenant). Todos persistidos em
   localStorage no protótipo, com formato pronto para migrar ao Supabase.
   ===================================================================== */

/* ----- Módulo 2: estoque inteligente ----- */
export interface ItemEstoque {
  item: string; // nome de exibição
  unid: string;
  qtd: number; // saldo atual
  minimo: number; // gatilho de alerta de estoque baixo (0 = sem alerta)
  atualizadoEm: string; // ISO
}
/** chave = item normalizado */
export type Estoque = Record<string, ItemEstoque>;

export interface MovEstoque {
  norm: string;
  item: string;
  unid: string;
  delta: number; // + entrada, − saída/baixa
  motivo: 'entrada' | 'baixa' | 'ajuste' | 'recebimento';
  em: string;
  papel: Papel;
  ref?: string; // semana/observação
}

/* ----- Módulo 3: controle de desperdício ----- */
export interface RegistroDesperdicio {
  id: string;
  dia: number; // 0=segunda … 6=domingo
  prato: string;
  produzido: number;
  consumido: number;
  unid: 'porções' | 'kg';
  motivo?: string;
  em: string;
}

/* ----- Módulo 4: índice de aceitação dos pratos ----- */
export interface RegistroAceitacao {
  prato: string; // nome de exibição (última grafia vista)
  bom: number;
  ok: number;
  ruim: number;
  somaNotas: number; // soma das notas 1–5 (para média)
  n: number; // nº de avaliações com nota
  atualizadoEm: string;
}
/** chave = prato normalizado */
export type Aceitacao = Record<string, RegistroAceitacao>;

/* ----- Módulo 5: radar de preços (histórico por item) ----- */
export interface PontoPreco {
  valor: number;
  em: string; // ISO
}
/** chave = item normalizado → série temporal de preços */
export type HistoricoPrecos = Record<string, PontoPreco[]>;

/* ----- Módulo 6: previsão de demanda (eventos manuais) ----- */
export interface EventoDemanda {
  id: string;
  data: string; // yyyy-mm-dd
  rotulo: string;
  fator: number; // multiplicador da demanda (0 = fechado, 1.2 = +20%)
}

/* ----- Módulo 9: auditoria e segurança ----- */
export type MotivoDecisao =
  | 'preco_subiu'
  | 'preco_caiu'
  | 'falta_estoque'
  | 'qualidade_ruim'
  | 'baixa_aceitacao'
  | 'sazonalidade'
  | 'variedade'
  | 'outro';

export interface ContextoDecisao {
  motivo: MotivoDecisao;
  obs?: string;
}

export interface RegistroAuditoria {
  em: string; // ISO datetime
  papel: Papel;
  acao: string; // verbo curto: "alterou preço", "aprovou etapa"…
  alvo: string; // sobre o quê
  de?: string | number | null;
  para?: string | number | null;
  semana?: string;
  contexto?: ContextoDecisao; // por que a decisão foi tomada
}

/* ----- Módulo 11: rastreamento de ações e resultados ----- */
export type MetricaRastreada = 'custo_pp' | 'desperdicio_pct' | 'aceitacao_media';

export interface AcaoComprometida {
  id: string;
  semanaId: string;
  tipoObjetivo: string;
  descricao: string;
  base: string; // rastreabilidade: de onde veio a recomendação
  metrica: MetricaRastreada;
  valorAntes: number; // baseline no momento do comprometimento
  comprometidaEm: string; // ISO
  resultado?: ResultadoAcao;
}

export interface ResultadoAcao {
  semanaId: string;
  valorDepois: number;
  delta: number; // valorDepois − valorAntes
  avaliacao: 'melhorou' | 'igual' | 'piorou';
  avaliadoEm: string;
}

/* ----- Módulo 12: inteligência de substituições ----- */
export type MotivoSubstituicao = 'preco' | 'estoque' | 'qualidade' | 'variedade' | 'outro';

export interface SubstituicaoRegistro {
  id: string;
  semanaId: string;
  dia: number; // 0=segunda…6=domingo
  nomeOriginal: string;
  nomeSubstituto: string;
  normOriginal: string;
  normSubstituto: string;
  motivo: MotivoSubstituicao;
  registradoEm: string;
  aceitacaoSubstituto?: number; // nota média do substituto nesta semana
  desperdicioSubstituto?: number; // taxa de desperdício (0–1)
}

export interface SubstituicaoAprendida {
  normOriginal: string;
  normSubstituto: string;
  nomeOriginal: string;
  nomeSubstituto: string;
  n: number;
  aceitacaoMedia: number | null;
  desperdicioMedio: number | null;
  confianca: 'alta' | 'media' | 'baixa';
}

/* ----- Módulo 10: organização / multi-tenant (preparação Supabase) ----- */
export interface Empresa {
  id: string;
  nome: string;
  criadaEm: string;
}
export interface Unidade {
  id: string;
  empresaId: string;
  nome: string;
}
export interface Usuario {
  id: string;
  nome: string;
  email: string;
  papel: Papel;
  unidadeId: string;
}
export type Permissao =
  | 'cardapio:editar'
  | 'cardapio:aprovar'
  | 'compras:gerenciar'
  | 'recebimento:registrar'
  | 'estoque:gerenciar'
  | 'precos:editar'
  | 'auditoria:ver'
  | 'config:gerenciar';

/* ----- Módulo: perfil de fornecedor (inteligência além do preço) ----- */
export interface AvaliacaoFornecedor {
  em: string; // ISO
  qualidade: 1 | 2 | 3 | 4 | 5;
  entregaOk: boolean;
  obs?: string;
}

export interface PerfilFornecedor {
  nome: string;
  whatsapp?: string;
  pedidoMinimo?: number; // R$
  prazoEntregaDias?: number;
  formaPagamento?: string;
  avaliacoes: AvaliacaoFornecedor[];
  obs?: string;
}

/* ----- Módulo: funcionários e restrições alimentares ----- */
export type TurnoFuncionario = 'almoco' | 'jantar' | 'ambos';
export type TipoRestricao = 'alergia' | 'preferencia' | 'religioso';

export interface RestricaoAlimentar {
  tipo: TipoRestricao;
  alimento: string;
  obs?: string;
}

export interface Funcionario {
  id: string;
  nome: string;
  setor: string;
  turno: TurnoFuncionario;
  restricoes: RestricaoAlimentar[];
  ativo: boolean;
  criadoEm: string;
}

/* ----- Módulo: contagem de refeições por dia ----- */
export interface ContagemRefeicoesDia {
  data: string; // yyyy-mm-dd
  almoco: number;
  jantar: number;
  marmitas: number;
  obs?: string;
  registradoEm: string;
}
