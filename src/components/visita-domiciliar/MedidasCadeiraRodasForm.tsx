import React from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface MedidasCadeiraRodasFormProps {
  medidas: Record<string, string>;
  onChange: (medidas: Record<string, string>) => void;
}

const MEDIDAS_LIST = [
  { id: "A", label: "Largura dos Ombros" },
  { id: "B", label: "Largura do Quadril" },
  { id: "C", label: "Largura das Costas" },
  { id: "D", label: "Do assento ao topo da cabeça" },
  { id: "E", label: "Do assento à Nuca" },
  { id: "F", label: "Do assento à borda inf. da escápula" },
  { id: "G", label: "Altura do assento ao ombro" },
  { id: "H", label: "Altura do assento axila esquerda" },
  { id: "I", label: "Altura do assento axila direita" },
  { id: "J", label: "Altura do assento ao cotovelo" },
  { id: "K", label: "Profundidade do assento" },
  { id: "L", label: "Do pé à base do joelho" },
  { id: "M", label: "Tamanho do pé" },
];

const MedidasCadeiraRodasForm: React.FC<MedidasCadeiraRodasFormProps> = ({ medidas, onChange }) => {
  const handleInputChange = (id: string, value: string) => {
    onChange({ ...medidas, [id]: value });
  };

  return (
    <div className="space-y-6 border rounded-lg p-4 bg-muted/10">
      <h3 className="text-lg font-semibold border-b pb-2">Medidas para Cadeira de Rodas</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
        <div className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">ID</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-24">Medida (cm)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {MEDIDAS_LIST.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-bold">{item.id}</TableCell>
                  <TableCell className="text-sm">{item.label}</TableCell>
                  <TableCell>
                    <Input 
                      type="number" 
                      value={medidas[item.id] || ""} 
                      onChange={(e) => handleInputChange(item.id, e.target.value)}
                      className="h-8"
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-4 border rounded-lg shadow-sm">
            <h4 className="text-sm font-bold mb-4 text-center">Diagrama de Medidas</h4>
            <div className="flex flex-col sm:flex-row gap-4 justify-around items-center">
              {/* SVG Anatômico Lateral */}
              <div className="w-full max-w-[180px]">
                <p className="text-[10px] text-center font-semibold mb-1">Vista Lateral</p>
                <svg viewBox="0 0 200 250" className="w-full h-auto border border-dashed rounded bg-slate-50">
                  {/* Cabeça */}
                  <circle cx="100" cy="40" r="15" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Pescoço */}
                  <rect x="95" y="55" width="10" height="10" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Tronco */}
                  <rect x="80" y="65" width="40" height="80" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Assento */}
                  <line x1="60" y1="145" x2="140" y2="145" stroke="#0f172a" strokeWidth="3" />
                  {/* Coxa */}
                  <rect x="80" y="145" width="60" height="15" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Perna */}
                  <rect x="135" y="160" width="15" height="50" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Pé */}
                  <rect x="135" y="210" width="30" height="10" fill="none" stroke="#64748b" strokeWidth="2" />
                  
                  {/* Setas de Medidas Lateral */}
                  {/* D - Topo cabeça */}
                  <path d="M50 25 L50 145" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="40" y="85" fill="#e11d48" fontSize="12" fontWeight="bold">D</text>
                  
                  {/* E - Nuca */}
                  <path d="M160 55 L160 145" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="165" y="100" fill="#e11d48" fontSize="12" fontWeight="bold">E</text>

                  {/* F - Escápula */}
                  <path d="M175 90 L175 145" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="180" y="120" fill="#e11d48" fontSize="12" fontWeight="bold">F</text>

                  {/* J - Cotovelo */}
                  <path d="M70 115 L70 145" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="60" y="130" fill="#e11d48" fontSize="12" fontWeight="bold">J</text>

                  {/* K - Profundidade Assento */}
                  <path d="M80 165 L140 165" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="110" y="180" fill="#2563eb" fontSize="12" fontWeight="bold">K</text>

                  {/* L - Base joelho ao pé */}
                  <path d="M155 160 L155 210" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="160" y="190" fill="#2563eb" fontSize="12" fontWeight="bold">L</text>

                  {/* M - Tamanho do pé */}
                  <path d="M135 225 L165 225" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="145" y="240" fill="#2563eb" fontSize="12" fontWeight="bold">M</text>

                  <defs>
                    <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                      <path d="M 0 0 L 10 5 L 0 10 z" />
                    </marker>
                  </defs>
                </svg>
              </div>

              {/* SVG Anatômico Frontal */}
              <div className="w-full max-w-[180px]">
                <p className="text-[10px] text-center font-semibold mb-1">Vista Frontal</p>
                <svg viewBox="0 0 200 250" className="w-full h-auto border border-dashed rounded bg-slate-50">
                  {/* Cabeça */}
                  <circle cx="100" cy="40" r="15" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Tronco */}
                  <rect x="75" y="55" width="50" height="90" fill="none" stroke="#64748b" strokeWidth="2" />
                  {/* Pernas */}
                  <rect x="75" y="145" width="20" height="70" fill="none" stroke="#64748b" strokeWidth="2" />
                  <rect x="105" y="145" width="20" height="70" fill="none" stroke="#64748b" strokeWidth="2" />
                  
                  {/* Setas de Medidas Frontal */}
                  {/* A - Largura Ombros */}
                  <path d="M75 50 L125 50" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="90" y="45" fill="#e11d48" fontSize="12" fontWeight="bold">A</text>
                  
                  {/* B - Largura Quadril */}
                  <path d="M70 140 L130 140" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="90" y="135" fill="#e11d48" fontSize="12" fontWeight="bold">B</text>

                  {/* C - Largura Costas */}
                  <path d="M75 100 L125 100" stroke="#e11d48" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="90" y="95" fill="#e11d48" fontSize="12" fontWeight="bold">C</text>

                  {/* G - Assento ao Ombro */}
                  <path d="M60 55 L60 145" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="45" y="100" fill="#2563eb" fontSize="12" fontWeight="bold">G</text>

                  {/* H - Assento axila esq */}
                  <path d="M140 70 L140 145" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="145" y="110" fill="#2563eb" fontSize="12" fontWeight="bold">H</text>

                  {/* I - Assento axila dir */}
                  <path d="M155 70 L155 145" stroke="#2563eb" strokeWidth="1" markerStart="url(#arrow)" markerEnd="url(#arrow)" />
                  <text x="160" y="110" fill="#2563eb" fontSize="12" fontWeight="bold">I</text>
                </svg>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Largura assento (cm)</Label>
              <Input type="number" value={medidas.largura_assento || ""} onChange={(e) => handleInputChange("largura_assento", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Profundidade assento (cm)</Label>
              <Input type="number" value={medidas.profundidade_assento || ""} onChange={(e) => handleInputChange("profundidade_assento", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura encosto (cm)</Label>
              <Input type="number" value={medidas.altura_encosto || ""} onChange={(e) => handleInputChange("altura_encosto", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura apoio braço (cm)</Label>
              <Input type="number" value={medidas.altura_apoio_braco || ""} onChange={(e) => handleInputChange("altura_apoio_braco", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura apoio pés (cm)</Label>
              <Input type="number" value={medidas.altura_apoio_pes || ""} onChange={(e) => handleInputChange("altura_apoio_pes", e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Altura poplítea (cm)</Label>
              <Input type="number" value={medidas.altura_poplitea || ""} onChange={(e) => handleInputChange("altura_poplitea", e.target.value)} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedidasCadeiraRodasForm;
