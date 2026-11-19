import planta from '@/assets/planta-unidade.webp';

const setores = [
  { id: 'triagem', nome: 'Triagem', x: 21, y: 10 },
  { id: 'consultorios', nome: 'Consultórios', x: 45, y: 10 },
  { id: 'recepcao', nome: 'Recepção', x: 13, y: 46 },
  { id: 'procedimentos', nome: 'Procedimentos e sessões', x: 50, y: 48 },
] as const;

type Setor = typeof setores[number]['id'];

export function PlantaUnidade({ contagens }: { contagens: Record<Setor, number> | null }) {
  const indicadores = (id: Setor) => contagens ? String(contagens[id]) : '—';
  return <figure className="overflow-hidden rounded-xl border bg-card">
    <figcaption className="border-b px-4 py-3">
      <h2 className="font-semibold">Mapa operacional da unidade</h2>
      <p className="text-sm text-muted-foreground">Planta ilustrativa. Selecione um setor para consultar os registros da unidade. Farmácia, almoxarifado e internação aparecem apenas na ilustração.</p>
    </figcaption>
    <div className="overflow-x-auto" tabIndex={0} aria-label="Planta dos setores, com rolagem horizontal em telas pequenas">
      <div className="relative isolate min-w-[760px] overflow-hidden bg-white" style={{aspectRatio: '1356 / 684'}}>
        <img src={planta} alt="Vista em perspectiva das salas, com setas indicando os percursos entre recepção, triagem, consultórios e procedimentos." className="pointer-events-none absolute max-w-none" style={{width:'139.4558%', left:'-20.7965%', top:'-16.3743%'}} />
        {setores.map(s => <a key={s.id} href={'#cockpit-' + s.id} style={{left:s.x + '%', top:s.y + '%'}}
          className="absolute -translate-x-1/2 rounded-md border border-white bg-[#104768] px-3 py-2 text-xs font-semibold text-white shadow-md hover:bg-[#083351] focus-visible:outline focus-visible:outline-4 focus-visible:outline-amber-400">
          {s.nome} <span className="ml-1 rounded bg-white px-1.5 py-0.5 text-[#104768]">{indicadores(s.id)}</span></a>)}
      </div>
    </div>
    <nav aria-label="Acesso aos setores da planta" className="flex flex-wrap gap-2 border-t p-2 md:hidden">{setores.map(s =>
      <a key={s.id} className="rounded border px-3 py-2 text-sm" href={'#cockpit-' + s.id}>{s.nome} · {indicadores(s.id)}</a>)}</nav>
  </figure>;
}
