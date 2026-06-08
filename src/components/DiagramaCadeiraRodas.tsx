import React from 'react';

const DiagramaCadeiraRodas: React.FC = () => {
  return (
    <div className="flex flex-col sm:flex-row items-center justify-around gap-8 py-6 bg-white rounded-lg border">
      {/* Figura 1: Vista Lateral */}
      <div className="flex flex-col items-center">
        <h4 className="text-sm font-bold mb-4">Figura 1 — Vista Lateral</h4>
        <svg width="240" height="280" viewBox="0 0 240 280" className="w-full h-auto max-w-[240px]">
          {/* Silhueta Simplificada Lateral */}
          <path d="M160,40 Q170,40 170,50 L170,70 Q170,80 160,80 L140,80 Q130,80 130,70 L130,50 Q130,40 140,40 Z" fill="none" stroke="#333" strokeWidth="2" /> {/* Cabeça */}
          <path d="M150,80 L150,180" stroke="#333" strokeWidth="3" fill="none" /> {/* Tronco */}
          <path d="M150,180 L80,180" stroke="#333" strokeWidth="3" fill="none" /> {/* Coxa */}
          <path d="M80,180 L80,240" stroke="#333" strokeWidth="3" fill="none" /> {/* Perna */}
          <path d="M80,240 L110,240" stroke="#333" strokeWidth="3" fill="none" /> {/* Pé */}
          <path d="M150,120 L110,120 L110,160" stroke="#333" strokeWidth="3" fill="none" /> {/* Braço */}

          {/* Medição D: Topo da cabeça ao assento */}
          <line x1="185" y1="40" x2="185" y2="180" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M182,40 L188,40 M182,180 L188,180" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="190" y="110" className="font-bold fill-blue-900" fontSize="14">D</text>

          {/* Medição E: Nuca ao assento */}
          <line x1="120" y1="70" x2="120" y2="180" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M117,70 L123,70 M117,180 L123,180" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="105" y="125" className="font-bold fill-blue-900" fontSize="14">E</text>

          {/* Medição F: Borda inferior da escápula ao assento */}
          <line x1="140" y1="110" x2="140" y2="180" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M137,110 L143,110 M137,180 L143,180" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="135" y="145" className="font-bold fill-blue-900" fontSize="14">F</text>

          {/* Medição J: Cotovelo ao assento */}
          <line x1="100" y1="160" x2="150" y2="160" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <line x1="100" y1="160" x2="100" y2="180" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <text x="85" y="170" className="font-bold fill-blue-900" fontSize="14">J</text>

          {/* Medição K: Profundidade do assento */}
          <line x1="80" y1="195" x2="150" y2="195" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M80,192 L80,198 M150,192 L150,198" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="110" y="210" className="font-bold fill-blue-900" fontSize="14">K</text>

          {/* Medição L: Pé à base do joelho */}
          <line x1="65" y1="180" x2="65" y2="240" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M62,180 L68,180 M62,240 L68,240" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="45" y="215" className="font-bold fill-blue-900" fontSize="14">L</text>

          {/* Medição M: Tamanho do pé */}
          <line x1="80" y1="255" x2="110" y2="255" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M80,252 L80,258 M110,252 L110,258" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="90" y="270" className="font-bold fill-blue-900" fontSize="14">M</text>
        </svg>
      </div>

      {/* Figura 2: Vista Frontal */}
      <div className="flex flex-col items-center">
        <h4 className="text-sm font-bold mb-4">Figura 2 — Vista Frontal</h4>
        <svg width="240" height="280" viewBox="0 0 240 280" className="w-full h-auto max-w-[240px]">
          {/* Silhueta Simplificada Frontal */}
          <circle cx="120" cy="50" r="15" fill="none" stroke="#333" strokeWidth="2" /> {/* Cabeça */}
          <rect x="90" y="65" width="60" height="100" rx="10" fill="none" stroke="#333" strokeWidth="3" /> {/* Tronco */}
          <rect x="90" y="165" width="60" height="20" fill="none" stroke="#333" strokeWidth="3" /> {/* Assento/Quadril */}
          
          {/* Medição A: Largura dos Ombros */}
          <line x1="80" y1="75" x2="160" y2="75" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M80,72 L80,78 M160,72 L160,78" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="115" y="70" className="font-bold fill-blue-900" fontSize="14">A</text>

          {/* Medição C: Largura das Costas */}
          <line x1="85" y1="120" x2="155" y2="120" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M85,117 L85,123 M155,117 L155,123" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="115" y="115" className="font-bold fill-blue-900" fontSize="14">C</text>

          {/* Medição B: Largura do Quadril */}
          <line x1="80" y1="175" x2="160" y2="175" stroke="#1e3a8a" strokeWidth="1.5" />
          <path d="M80,172 L80,178 M160,172 L160,178" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="115" y="195" className="font-bold fill-blue-900" fontSize="14">B</text>

          {/* Medição G: Altura assento ao ombro */}
          <line x1="170" y1="75" x2="170" y2="165" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M167,75 L173,75 M167,165 L173,165" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="175" y="120" className="font-bold fill-blue-900" fontSize="14">G</text>

          {/* Medição H: Altura assento axila esquerda */}
          <line x1="85" y1="95" x2="85" y2="165" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M82,95 L88,95 M82,165 L88,165" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="70" y="130" className="font-bold fill-blue-900" fontSize="14">H</text>

          {/* Medição I: Altura assento axila direita */}
          <line x1="155" y1="95" x2="155" y2="165" stroke="#1e3a8a" strokeWidth="1.5" strokeDasharray="4" />
          <path d="M152,95 L158,95 M152,165 L158,165" stroke="#1e3a8a" strokeWidth="1.5" />
          <text x="140" y="130" className="font-bold fill-blue-900" fontSize="14">I</text>
        </svg>
      </div>
    </div>
  );
};

export default DiagramaCadeiraRodas;
