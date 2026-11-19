export type Papel = 'clinico' | 'enfermagem' | 'paciente' | 'medicacao';

export function AvatarPersonagem({ papel, variante = '' }: { papel: Papel; variante?: string }) {
  const equipe = papel === 'clinico' || papel === 'enfermagem';
  const alternado = (variante.charCodeAt(variante.length - 1) || 0) % 2 === 1;
  const pele = alternado ? '#ad7557' : '#e1b494';
  const uniforme = papel === 'clinico' ? '#fff' : papel === 'enfermagem' ? '#428baa' : alternado ? '#d89068' : '#698fa0';
  return <svg aria-hidden="true" className="hospital-avatar" viewBox="0 0 84 92" data-papel={papel}>
    <ellipse cx="40" cy="84" rx="25" ry="4" fill="#274b5f" opacity=".14"/>
    <g fill="#678b9d" stroke="#375b6c" strokeWidth="2">
      <path d="M18 46q0-5 5-5h12v24h22v6H21z"/><path d="M23 69v13m28-13v13"/>
    </g>
    {papel === 'medicacao' && <g stroke="#587380" fill="#dbf1ef"><path d="M69 82V12H58m5 70h12"/><rect x="54" y="14" width="10" height="15" rx="2"/><path d="M59 29q9 29-9 26" fill="none"/></g>}
    <g className="hospital-respira"><g transform={papel === 'medicacao' ? 'rotate(-19 39 60)' : undefined}>
      <path d="M31 58h17l9 6-2 14h-7V69H32z" fill="#394f66"/><path d="M48 77h8l4 4q0 2-12 1z" fill="#253b48"/>
      <path d="M28 34q8-5 15-1 7 2 8 13l-3 16H26z" fill={uniforme} stroke="#69858c"/>
      <path d="M33 31v5q4 5 8 0v-7" fill={pele}/><ellipse cx="37" cy="22" rx="11" ry="13" fill={pele}/>
      <path d={alternado ? 'M25 27q-4-20 10-20 14-2 15 14l-6-4-3-4q-3 8-12 9l2 11h-7z' : 'M26 23q-5-18 11-17 11 0 12 12-6 0-9-5-4 6-13 6z'} fill="#443e42"/>
      <circle cx="43" cy="22" r="1" fill="#423836"/>
      {equipe && <><path d="M32 35q-4 15 5 14 7 0 5-13" fill="none" stroke="#416b78" strokeWidth="2"/><rect x="41" y="42" width="6" height="8" rx="1" fill="#bddee8"/></>}
      {papel === 'enfermagem' && <rect x="43" y="43" width="13" height="18" rx="2" fill="#f5e6bd" stroke="#63808a"/>}
      <path d="m32 44 4 10 14-2" fill="none" stroke={pele} strokeWidth="6" strokeLinecap="round"/>
    </g></g>
  </svg>;
}
