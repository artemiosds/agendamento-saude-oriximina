import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { User, MapPin, Phone, FileHeart } from "lucide-react";
import { maskCNS } from "@/lib/cnsUtils";
import { applyPhoneMask } from "@/lib/phoneUtils";

const UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG","PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"];
const RACA_COR = [
  { value: "branca", label: "Branca" },
  { value: "preta", label: "Preta" },
  { value: "parda", label: "Parda" },
  { value: "amarela", label: "Amarela" },
  { value: "indigena", label: "Indígena" },
];
const UBS_LIST = [
  "UBS Dr. Lauro Corrêa Pinto","UBS Penta","UBS Corino Guerreiro","UBS Santa Luzia",
  "UBS Tânia Siqueira da Fonseca","UBS Antônio Miléo","Hospital Municipal de Oriximiná",
  "UBS Nossa Sra. das Graças","UBS Fluvial Manoel Andrade","UBS Ribeirinho","Hospital Regional Menino Jesus",
];

const maskCPF = (v: string): string => {
  const d = (v || "").replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};
const maskCEP = (v: string): string => {
  const d = (v || "").replace(/\D/g, "").slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
};

export interface DadosPacienteValue {
  // Identificação
  nome: string;
  dataNascimento: string; // yyyy-mm-dd
  cpf: string;
  cns: string;
  sexo: string;
  raca_cor: string;
  nacionalidade: string;
  naturalidade: string;
  naturalidade_uf: string;
  municipio: string;
  nome_mae: string;
  menor_idade: boolean;
  nome_responsavel: string;
  cpf_responsavel: string;
  // Endereço
  cep: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  endereco_municipio: string;
  endereco_uf: string;
  // Contato
  telefone: string;
  telefone_secundario: string;
  email: string;
  // Complementares
  is_gestante: boolean;
  is_pne: boolean;
  is_autista: boolean;
  ubs_origem: string;
  observacoes: string;
}

export const emptyDadosPaciente = (): DadosPacienteValue => ({
  nome: "", dataNascimento: "", cpf: "", cns: "", sexo: "", raca_cor: "",
  nacionalidade: "Brasileira", naturalidade: "", naturalidade_uf: "", municipio: "Oriximiná",
  nome_mae: "", menor_idade: false, nome_responsavel: "", cpf_responsavel: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "",
  endereco_municipio: "Oriximiná", endereco_uf: "PA",
  telefone: "", telefone_secundario: "", email: "",
  is_gestante: false, is_pne: false, is_autista: false, ubs_origem: "", observacoes: "",
});

interface Props {
  value: DadosPacienteValue;
  onChange: (patch: Partial<DadosPacienteValue>) => void;
  errors?: Record<string, string>;
  emailDisabled?: boolean;
}

const DadosPacienteBlocos: React.FC<Props> = ({ value, onChange, errors = {}, emailDisabled }) => {
  const set = (k: keyof DadosPacienteValue) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange({ [k]: e.target.value } as Partial<DadosPacienteValue>);

  return (
    <Accordion type="multiple" defaultValue={["ident", "endereco", "contato"]} className="space-y-2">
      {/* IDENTIFICAÇÃO */}
      <AccordionItem value="ident" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-semibold"><User className="w-4 h-4 text-primary" /> Identificação</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div>
            <Label>Nome completo *</Label>
            <Input value={value.nome} onChange={set("nome")} />
            {errors.nome && <p className="text-xs text-destructive mt-1">{errors.nome}</p>}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de nascimento</Label>
              <Input type="date" value={value.dataNascimento} onChange={set("dataNascimento")} />
            </div>
            <div>
              <Label>Sexo</Label>
              <Select value={value.sexo} onValueChange={(v) => onChange({ sexo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="feminino">Feminino</SelectItem>
                  <SelectItem value="masculino">Masculino</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>CPF</Label>
              <Input value={value.cpf} onChange={(e) => onChange({ cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
            </div>
            <div>
              <Label>Cartão SUS (CNS)</Label>
              <Input value={value.cns} onChange={(e) => onChange({ cns: maskCNS(e.target.value) })} placeholder="000 0000 0000 0000" maxLength={18} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Raça/Cor</Label>
              <Select value={value.raca_cor} onValueChange={(v) => onChange({ raca_cor: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {RACA_COR.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nacionalidade</Label>
              <Input value={value.nacionalidade} onChange={set("nacionalidade")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Naturalidade (cidade)</Label>
              <Input value={value.naturalidade} onChange={set("naturalidade")} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={value.naturalidade_uf} onValueChange={(v) => onChange({ naturalidade_uf: v })}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Nome da mãe</Label>
            <Input value={value.nome_mae} onChange={set("nome_mae")} />
          </div>
          <div className="flex items-center justify-between border rounded-md px-3 py-2">
            <Label className="text-sm">Menor de idade (responsável obrigatório)</Label>
            <Switch checked={value.menor_idade} onCheckedChange={(c) => onChange({ menor_idade: c })} />
          </div>
          {value.menor_idade && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Nome do responsável</Label>
                <Input value={value.nome_responsavel} onChange={set("nome_responsavel")} />
              </div>
              <div>
                <Label>CPF do responsável</Label>
                <Input value={value.cpf_responsavel} onChange={(e) => onChange({ cpf_responsavel: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
              </div>
            </div>
          )}
        </AccordionContent>
      </AccordionItem>

      {/* ENDEREÇO */}
      <AccordionItem value="endereco" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-semibold"><MapPin className="w-4 h-4 text-primary" /> Endereço</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>CEP</Label>
              <Input value={value.cep} onChange={(e) => onChange({ cep: maskCEP(e.target.value) })} placeholder="00000-000" />
            </div>
            <div className="col-span-2">
              <Label>Logradouro (rua, avenida, travessa…)</Label>
              <Input value={value.logradouro} onChange={set("logradouro")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Número</Label>
              <Input value={value.numero} onChange={set("numero")} />
            </div>
            <div>
              <Label>Complemento</Label>
              <Input value={value.complemento} onChange={set("complemento")} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={value.bairro} onChange={set("bairro")} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>Município</Label>
              <Input value={value.endereco_municipio} onChange={set("endereco_municipio")} />
            </div>
            <div>
              <Label>UF</Label>
              <Select value={value.endereco_uf} onValueChange={(v) => onChange({ endereco_uf: v })}>
                <SelectTrigger><SelectValue placeholder="UF" /></SelectTrigger>
                <SelectContent>{UFS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* CONTATO */}
      <AccordionItem value="contato" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-semibold"><Phone className="w-4 h-4 text-primary" /> Contato</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Telefone principal *</Label>
              <Input value={value.telefone} onChange={(e) => onChange({ telefone: applyPhoneMask(e.target.value) })} placeholder="(93) 99999-0000" />
              {errors.telefone && <p className="text-xs text-destructive mt-1">{errors.telefone}</p>}
            </div>
            <div>
              <Label>Telefone secundário</Label>
              <Input value={value.telefone_secundario} onChange={(e) => onChange({ telefone_secundario: applyPhoneMask(e.target.value) })} placeholder="(93) 99999-0000" />
            </div>
          </div>
          <div>
            <Label>E-mail *</Label>
            <Input type="email" value={value.email} onChange={set("email")} disabled={emailDisabled} placeholder="paciente@email.com" />
            {emailDisabled && <p className="text-xs text-muted-foreground mt-1">O e-mail é o login do portal e não pode ser alterado aqui.</p>}
            {errors.email && <p className="text-xs text-destructive mt-1">{errors.email}</p>}
          </div>
        </AccordionContent>
      </AccordionItem>

      {/* COMPLEMENTARES */}
      <AccordionItem value="complementares" className="border rounded-lg px-3">
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2 text-sm font-semibold"><FileHeart className="w-4 h-4 text-primary" /> Complementares</span>
        </AccordionTrigger>
        <AccordionContent className="space-y-3 pt-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">Gestante</Label>
              <Switch checked={value.is_gestante} onCheckedChange={(c) => onChange({ is_gestante: c })} />
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">PNE</Label>
              <Switch checked={value.is_pne} onCheckedChange={(c) => onChange({ is_pne: c })} />
            </div>
            <div className="flex items-center justify-between border rounded-md px-3 py-2">
              <Label className="text-sm">TEA (autista)</Label>
              <Switch checked={value.is_autista} onCheckedChange={(c) => onChange({ is_autista: c })} />
            </div>
          </div>
          <div>
            <Label>UBS de origem</Label>
            <Select value={value.ubs_origem} onValueChange={(v) => onChange({ ubs_origem: v })}>
              <SelectTrigger><SelectValue placeholder="Selecione a UBS de origem" /></SelectTrigger>
              <SelectContent>{UBS_LIST.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Observações</Label>
            <Textarea value={value.observacoes} onChange={set("observacoes")} rows={3} />
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
};

export default DadosPacienteBlocos;

// Serialização: divide o valor em colunas nativas + custom_data
export function serializeDadosPaciente(v: DadosPacienteValue, prevCustomData: Record<string, any> = {}) {
  const enderecoStr = [
    v.logradouro,
    v.numero && `, ${v.numero}`,
    v.complemento && ` - ${v.complemento}`,
    v.bairro && `, ${v.bairro}`,
  ].filter(Boolean).join("");

  const custom_data = {
    ...prevCustomData,
    cep: v.cep,
    logradouro: v.logradouro,
    numero: v.numero,
    complemento: v.complemento,
    bairro: v.bairro,
    endereco_municipio: v.endereco_municipio,
    endereco_uf: v.endereco_uf,
    telefone_secundario: v.telefone_secundario,
    nacionalidade: v.nacionalidade,
  };

  return {
    nome: v.nome,
    cpf: v.cpf,
    cns: v.cns,
    data_nascimento: v.dataNascimento || null,
    telefone: v.telefone,
    email: v.email,
    endereco: enderecoStr,
    sexo: v.sexo || null,
    raca_cor: v.raca_cor || null,
    naturalidade: v.naturalidade,
    naturalidade_uf: v.naturalidade_uf,
    municipio: v.municipio,
    nome_mae: v.nome_mae,
    menor_idade: v.menor_idade,
    nome_responsavel: v.menor_idade ? v.nome_responsavel : "",
    cpf_responsavel: v.menor_idade ? v.cpf_responsavel : "",
    is_gestante: v.is_gestante,
    is_pne: v.is_pne,
    is_autista: v.is_autista,
    ubs_origem: v.ubs_origem,
    observacoes: v.observacoes,
    custom_data,
  };
}

// Deserializa uma linha da tabela pacientes para o value do formulário
export function deserializeDadosPaciente(row: any): DadosPacienteValue {
  const cd = row?.custom_data || {};
  return {
    nome: row?.nome || "",
    dataNascimento: row?.data_nascimento || "",
    cpf: row?.cpf || "",
    cns: row?.cns || "",
    sexo: row?.sexo || "",
    raca_cor: row?.raca_cor || "",
    nacionalidade: cd.nacionalidade || "Brasileira",
    naturalidade: row?.naturalidade || "",
    naturalidade_uf: row?.naturalidade_uf || "",
    municipio: row?.municipio || "Oriximiná",
    nome_mae: row?.nome_mae || "",
    menor_idade: !!row?.menor_idade,
    nome_responsavel: row?.nome_responsavel || "",
    cpf_responsavel: row?.cpf_responsavel || "",
    cep: cd.cep || "",
    logradouro: cd.logradouro || row?.endereco || "",
    numero: cd.numero || "",
    complemento: cd.complemento || "",
    bairro: cd.bairro || "",
    endereco_municipio: cd.endereco_municipio || "Oriximiná",
    endereco_uf: cd.endereco_uf || "PA",
    telefone: row?.telefone || "",
    telefone_secundario: cd.telefone_secundario || "",
    email: row?.email || "",
    is_gestante: !!row?.is_gestante,
    is_pne: !!row?.is_pne,
    is_autista: !!row?.is_autista,
    ubs_origem: row?.ubs_origem || "",
    observacoes: row?.observacoes || "",
  };
}
