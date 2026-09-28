/** Os mesmos estados liberadores usados pelas consultas de capacidade no banco. */
export const STATUS_LIBERA_VAGA = new Set(['cancelado', 'falta']);

export const statusOcupaVaga = (status: string): boolean => !STATUS_LIBERA_VAGA.has(status);
