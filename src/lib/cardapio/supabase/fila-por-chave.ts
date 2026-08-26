export class FilaPorChave {
  private caudas = new Map<string, Promise<void>>();

  enfileirar(chave: string, tarefa: () => Promise<void>): Promise<void> {
    const anterior = this.caudas.get(chave) ?? Promise.resolve();
    let atual!: Promise<void>;

    // Se a tentativa anterior falhou, a versão seguinte ainda precisa tentar.
    atual = anterior
      .catch(() => {})
      .then(tarefa)
      .finally(() => {
        // Só remove a chave quando esta ainda for a ÚLTIMA tarefa enfileirada.
        if (this.caudas.get(chave) === atual) this.caudas.delete(chave);
      });

    this.caudas.set(chave, atual);
    return atual;
  }

  tem(chave: string): boolean {
    return this.caudas.has(chave);
  }

  vazia(): boolean {
    return this.caudas.size === 0;
  }

  chavesAtivas(): string[] {
    return Array.from(this.caudas.keys());
  }
}
