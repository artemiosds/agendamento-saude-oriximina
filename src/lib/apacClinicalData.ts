export interface ApacProcedure { codigo: string; nome: string; quantidade: number }
export interface ApacClinicalData {
  estabelecimento: string; cnes: string;
  principal: ApacProcedure; secundarios: ApacProcedure[];
  diagnostico: string; cidPrincipal: string; cidSecundario: string; cidAssociado: string;
  observacoes: string; solicitante: string; dataSolicitacao: string;
  tipoDocumento: '' | 'CPF' | 'CNS'; documento: string;
}
export const emptyApacClinicalData = (): ApacClinicalData => ({
  estabelecimento:'', cnes:'', principal:{codigo:'',nome:'',quantidade:1}, secundarios:[],
  diagnostico:'',cidPrincipal:'',cidSecundario:'',cidAssociado:'',observacoes:'',
  solicitante:'',dataSolicitacao:'',tipoDocumento:'',documento:'',
});
export function apacObservationLines(value: string): string[] {
  return value.split('\n').flatMap(paragraph => {
    const lines: string[] = []; let line = '';
    for (const word of paragraph.split(/\s+/)) {
      if (line && (line + ' ' + word).length > 95) { lines.push(line); line = ''; }
      if (word.length > 95) {
        if (line) lines.push(line); line = '';
        for (let i = 0; i < word.length; i += 95) lines.push(word.slice(i, i + 95));
      } else line += (line ? ' ' : '') + word;
    }
    return [...lines, line];
  });
}
export function validateApacClinicalData(d: ApacClinicalData): string[] {
  const errors: string[]=[];
  if (d.cnes && !/^\d{7}$/.test(d.cnes)) errors.push('CNES deve ter 7 dígitos.');
  if(d.secundarios.length>5) errors.push('O formulário comporta até 5 procedimentos secundários.');
  for(const p of [d.principal,...d.secundarios]) {
    if((p.codigo||p.nome) && (!/^\d{10}$/.test(p.codigo)||!p.nome.trim())) errors.push('Selecione código e nome do procedimento SIGTAP.');
    if((p.codigo||p.nome) && (!Number.isInteger(p.quantidade)||p.quantidade<1||p.quantidade>999)) errors.push('Quantidade deve ser inteira entre 1 e 999.');
  }
  for(const cid of [d.cidPrincipal,d.cidSecundario,d.cidAssociado]) if(cid&&!/^[A-Z]\d{2}(?:\.?[A-Z0-9])?$/.test(cid)) errors.push('CID inválido: use um código por campo.');
  if(d.documento && (!d.tipoDocumento || !new RegExp(`^\\d{${d.tipoDocumento==='CPF'?11:15}}$`).test(d.documento))) errors.push('Confira o tipo e o número do documento do solicitante.');
  if(d.tipoDocumento&&!d.documento) errors.push('Preencha o documento do solicitante ou remova o tipo selecionado.');
  if(d.dataSolicitacao) {
    const date = new Date(`${d.dataSolicitacao}T12:00:00Z`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(d.dataSolicitacao) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==d.dataSolicitacao) errors.push('Data da solicitação inválida.');
  }
  if(apacObservationLines(d.observacoes).length > 8) errors.push('Observações excedem 8 linhas no formulário. Reduza as quebras de linha.');
  if(d.observacoes.length>650||d.diagnostico.length>100) errors.push('Texto excede o espaço disponível no formulário.');
  return [...new Set(errors)];
}
