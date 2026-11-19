export type Papel = 'clinico' | 'enfermagem' | 'paciente' | 'medicacao';

/** A planta usa grupos SVG nativos. Os identificadores servem só para variar o desenho. */
export function AvatarPersonagem({ papel, x, y, variante = '' }: {
  papel: Papel; x: number; y: number; variante?: string;
}) {
  const i = Array.from(variante).reduce((n, char) => (n + char.charCodeAt(0)) % 5, 0);
  const skin = ['#e1aa81', '#a96d56', '#efbb9d', '#855742', '#d19970'][i];
  const hair = ['#58362e', '#282d31', '#8e5341', '#171f25', '#463639'][i];
  const staff = papel === 'clinico' || papel === 'enfermagem';
  const cloth = papel === 'clinico' ? '#fefdf3' : papel === 'enfermagem' ? '#258d96' :
    ['#b46b71', '#5279a2', '#8069a2', '#ce8b49', '#3b8e82'][i];
  return <g transform={`translate(${x} ${y})`} data-papel={papel} aria-hidden="true">
    <ellipse cy="11" rx="9.5" ry="5" fill="#21463f" opacity=".18" />
    <g className="planta-personagem">
      <path d="M-7 3q7-5 14 0l1 8H-8z" fill={cloth} stroke="#4b6869" strokeWidth=".7" />
      <path d="M-5 10v5m10-5v5" stroke="#294552" strokeWidth="3.3" strokeLinecap="round" />
      <path d="M-4 5v4m8-4v4" stroke={skin} strokeWidth="1.8" strokeLinecap="round" />
      <circle cy="-2" r="6" fill={skin} stroke="#68483f" strokeWidth=".6" />
      <path d="M-6-1c-2-8 11-11 12-2l-2-1-3-2-6 2z" fill={hair} />
      <path d="M-2.6-1h.2m4.7 0h.2" stroke="#443234" strokeWidth="1" strokeLinecap="round" />
      {staff && <path d="M1 4h4v3H1z" fill="#55b4a7" stroke="#f1fcfa" strokeWidth=".65" />}
    </g>
  </g>;
}
