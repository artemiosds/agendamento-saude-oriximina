import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { loadBpaSigtapCatalog, getCompetenciaReferenciaCatalogo } from '@/lib/bpaSigtapCatalog';
import { instrumentoBadge, instrumentoRotulo } from '@/lib/sigtapInstruments';

/** One cached catalog load per result list, never a request per procedure. */
export function useSigtapInstruments(codes: string[], competencia?: string) {
  const key = [...new Set(codes)].sort().join('|');
  const [snapshot, setSnapshot] = useState<{ key: string; comp?: string; ref: string; map: Map<string,string[]> }>();
  useEffect(() => {
    let cancelled = false;
    if (!key || !competencia || !/^\d{6}$/.test(competencia)) return;
    void loadBpaSigtapCatalog(competencia).then(catalog => {
      if (!cancelled) setSnapshot({key,comp:competencia,ref:getCompetenciaReferenciaCatalogo(catalog) || competencia,
        map:new Map(key.split('|').flatMap(code => { const proc=catalog.get(code); return proc ? [[code,[...proc.instrumentos]] as [string,string[]]] : []; }))});
    }).catch(() => { if (!cancelled) setSnapshot(undefined); });
    return () => { cancelled=true; };
  }, [key,competencia]);
  return snapshot?.key===key && snapshot.comp===competencia ? snapshot : undefined;
}
export function SigtapInstrumentBadge({ codes, reference }: { codes?: string[]; reference?: string }) {
  const confirmed = !!codes?.length;
  const bpaI = codes?.includes('02');
  return <Badge variant="outline" className={confirmed && bpaI ? 'border-emerald-500 text-emerald-700 whitespace-normal text-[10px]' : 'border-amber-400 text-amber-700 whitespace-normal text-[10px]'}
    title={`${instrumentoRotulo(codes || [])}${reference ? ` · Referência ${reference}` : ''}`}>
    {confirmed ? instrumentoBadge(codes!) : 'Instrumento não confirmado'}
  </Badge>;
}
