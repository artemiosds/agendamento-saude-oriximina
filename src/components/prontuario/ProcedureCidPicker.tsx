import React, { useEffect, useRef, useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { CheckCircle, Search, X } from 'lucide-react';
import { normalizeProcedureCid, partitionProcedureCids, type ProcedureCidOption } from '@/lib/procedureCidSelection';

interface Props {
  options?: ProcedureCidOption[];
  selected: string[];
  error?: string;
  onChange: (codes: string[]) => void;
  onAddManual?: (typedCode: string) => Promise<void>;
}

/** Search is local to this procedure; it never queries the general CID catalog. */
export default React.memo(function ProcedureCidPicker({ options, selected, error, onChange, onAddManual }: Props) {
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [manualError, setManualError] = useState('');
  const requestRef = useRef(0);
  useEffect(() => { requestRef.current += 1; setManualError(''); setAdding(false); return () => { requestRef.current += 1; }; }, [options, error]);
  const manualAllowed = !!options && options.length === 0 && !error && !!onAddManual;
  const addManual = async () => {
    if (!manualAllowed || adding || !query.trim()) return;
    const request = ++requestRef.current;
    setAdding(true); setManualError('');
    try { await onAddManual!(query); if (request === requestRef.current) setQuery(''); }
    catch (failure) { if (request === requestRef.current) setManualError(failure instanceof Error ? failure.message : 'Não foi possível conferir o CID. Tente novamente.'); }
    finally { if (request === requestRef.current) setAdding(false); }
  };
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    const codeTerm = normalizeProcedureCid(query);
    return (options || []).filter(item => !term || item.codigo.includes(codeTerm) || item.descricao.toLocaleLowerCase('pt-BR').includes(term));
  }, [options, query]);
  const selectedSet = new Set(selected.map(normalizeProcedureCid));
  const legacy = options ? partitionProcedureCids(selected, options).rejected : [];
  const remove = (code: string) => onChange(selected.filter(value => normalizeProcedureCid(value) !== code));
  return <div className="space-y-2">
    <div className="relative">
      <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-foreground pointer-events-none" />
      <Input aria-label={manualAllowed ? "Digitar CID manualmente" : "Pesquisar CIDs relacionados ao procedimento"} value={query} onChange={e => { setQuery(e.target.value); setManualError(''); }} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (manualAllowed) void addManual(); } }} placeholder={manualAllowed ? "Digite o código CID-10, por exemplo Z000..." : "Pesquisar somente CIDs relacionados a este procedimento..."} className="pl-7 h-8 text-xs text-foreground" />
    </div>
    <p className="text-xs font-semibold text-foreground">CIDs relacionados ao procedimento</p>
    {error ? <p role="alert" className="text-xs font-medium text-amber-900 dark:text-amber-200">Não foi possível conferir os CIDs: {error} Feche e abra os detalhes para tentar novamente. Os CIDs já salvos foram preservados.</p>
      : !options ? <p className="text-xs text-foreground">Conferindo CIDs da competência...</p>
      : filtered.length === 0 ? <p className="text-xs text-foreground">{options.length ? 'Nenhum CID relacionado a este procedimento corresponde à busca.' : 'O catálogo desta competência não informa uma lista restritiva de CIDs para este procedimento. Os diagnósticos já registrados serão preservados.'}</p>
      : <div className="flex flex-wrap gap-1.5">{filtered.map(item => {
        const checked = selectedSet.has(item.codigo);
        return <button type="button" key={item.codigo} aria-pressed={checked} title={item.descricao || item.codigo}
          onClick={() => checked ? remove(item.codigo) : onChange([...selected, item.codigo])}
          className={'inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors ' + (checked
            ? 'bg-sky-800 text-white border-sky-900 hover:bg-sky-900 dark:bg-sky-300 dark:text-slate-950 dark:border-sky-200'
            : 'bg-white text-slate-900 border-slate-400 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-100 dark:border-slate-500')}>
          {checked && <CheckCircle className="h-3.5 w-3.5 shrink-0" />}<span className="font-mono font-semibold">{item.codigo}</span>
          {item.descricao && <span>· {item.descricao}</span>}
        </button>;
      })}</div>}
    {manualAllowed && <div className="space-y-1">
      <p className="text-xs text-foreground">Sem lista restritiva no SIGTAP desta competência. Você pode informar um CID do catálogo CID-10, conforme o diagnóstico clínico.</p>
      <button type="button" disabled={adding || !query.trim()} onClick={() => void addManual()} className="rounded-md border border-sky-900 bg-sky-800 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60">{adding ? 'Conferindo CID...' : 'Adicionar CID informado'}</button>
      {manualError && <p role="alert" className="text-xs font-medium text-red-800 dark:text-red-200">{manualError}</p>}
    </div>}
    {legacy.length > 0 && <div role="note" className="rounded-md border border-amber-400 bg-amber-50 p-2 text-xs text-amber-950 dark:bg-amber-950 dark:text-amber-100">
      <p className="font-semibold">CIDs já registrados sem vínculo confirmado neste procedimento</p>
      <p>Preservados para revisão clínica; não são sugestões compatíveis para BPA-I. Remova somente após conferir o registro.</p>
      <div className="mt-2 flex flex-wrap gap-2">{legacy.map(code => <button type="button" key={code} onClick={() => remove(code)} aria-label={`Retirar CID ${code} da seleção`} className="inline-flex items-center gap-1 rounded border border-amber-600 px-2 py-1 font-semibold">{code}<X className="h-3 w-3" /></button>)}</div>
    </div>}
    {(!options || options.length === 0) && selected.length > 0 && <div className="text-xs font-medium text-foreground"><p>CIDs registrados (preservados): {selected.join(', ')}. {options ? 'Sem lista restritiva no catálogo.' : 'Compatibilidade pendente.'}</p>{manualAllowed && <div className="mt-1 flex flex-wrap gap-2">{[...selectedSet].map(code => <button type="button" key={code} onClick={() => remove(code)} aria-label={`Retirar CID ${code} da seleção`} className="inline-flex items-center gap-1 rounded border border-sky-900 bg-sky-800 px-2 py-1 text-white">{code}<X className="h-3 w-3" /></button>)}</div>}</div>}
  </div>;
});
