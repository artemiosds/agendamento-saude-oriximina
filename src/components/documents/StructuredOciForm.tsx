import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Search, ArrowUp, ArrowDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SigtapProcedurePicker, { type SigtapPickerValue } from "@/components/documents/SigtapProcedurePicker";
import type { OciStructuredData } from "@/lib/ociDocument";

interface Props {
  value: OciStructuredData;
  onChange: (value: OciStructuredData) => void;
  validation: {
    competencia: string;
    cbo: string;
    dataNascimento?: string;
    dataAtendimento?: string;
    sexo?: string;
  };
  principalLocked?: boolean;
}

interface CidOption {
  codigo: string;
  descricao: string;
}

const StructuredOciForm: React.FC<Props> = ({ value, onChange, validation, principalLocked }) => {
  const [cidQuery, setCidQuery] = useState("");
  const [cidResults, setCidResults] = useState<CidOption[]>([]);
  const [cidTarget, setCidTarget] = useState<"principal" | "secundario" | "associadas">("principal");

  const patch = (partial: Partial<OciStructuredData>) => onChange({ ...value, ...partial });
  const patchAuth = (partial: Partial<OciStructuredData["autorizacao"]>) =>
    patch({ autorizacao: { ...value.autorizacao, ...partial } });

  useEffect(() => {
    const q = cidQuery.trim();
    if (q.length < 2) {
      setCidResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      const clean = q.replace(/[%_]/g, " ").trim();
      const numericLike = /^[A-Za-z]\d*/.test(clean);
      let request = supabase
        .from("sigtap_procedimento_cids")
        .select("cid_codigo,cid_descricao")
        .limit(20);
      request = numericLike
        ? request.ilike("cid_codigo", `%${clean}%`)
        : request.ilike("cid_descricao", `%${clean}%`);
      const { data } = await request;
      const unique = new Map<string, CidOption>();
      (data || []).forEach((row: any) => {
        if (!unique.has(row.cid_codigo)) unique.set(row.cid_codigo, { codigo: row.cid_codigo, descricao: row.cid_descricao || "" });
      });
      setCidResults(Array.from(unique.values()));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [cidQuery]);

  const setCid = (field: "cidPrincipal" | "cidSecundario" | "cidCausasAssociadas", codigo: string) => {
    patch({ [field]: codigo } as Partial<OciStructuredData>);
    setCidQuery("");
    setCidResults([]);
  };

  const secondaryRows = value.procedimentosSecundarios;

  const addSecondary = (proc: SigtapPickerValue | null) => {
    if (!proc) return;
    patch({
      procedimentosSecundarios: [
        ...secondaryRows,
        { codigo: proc.codigo, nome: proc.nome, quantidade: 1 },
      ],
    });
  };

  const removeSecondary = (index: number) => {
    patch({ procedimentosSecundarios: secondaryRows.filter((_, i) => i !== index) });
  };

  const moveSecondary = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= secondaryRows.length) return;
    const next = [...secondaryRows];
    [next[index], next[target]] = [next[target], next[index]];
    patch({ procedimentosSecundarios: next });
  };

  const updateSecondaryQty = (index: number, quantidade: number) => {
    patch({
      procedimentosSecundarios: secondaryRows.map((item, i) =>
        i === index ? { ...item, quantidade: Math.max(1, quantidade || 1) } : item
      ),
    });
  };

  const patientRows = useMemo(() => [
    ["Paciente", value.paciente.nome],
    ["CNS", value.paciente.cns],
    ["Nascimento", value.paciente.dataNascimento],
    ["Sexo", value.paciente.sexo],
    ["Telefone", value.paciente.telefone],
    ["Endereço", value.paciente.enderecoCompleto],
    ["Município/UF", [value.paciente.municipio, value.paciente.uf].filter(Boolean).join("/")],
    ["CEP", value.paciente.cep],
  ], [value.paciente]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Identificação do paciente</h4>
            <p className="text-xs text-muted-foreground">Dados do paciente carregados do cadastro. A identificação do estabelecimento e o CNES ficam em branco no OCI.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {patientRows.map(([label, val]) => (
              <div key={label} className="rounded-md border p-2">
                <div className="text-[11px] uppercase text-muted-foreground">{label}</div>
                <div className="text-sm font-medium break-words">{val || "—"}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <h4 className="font-semibold">Justificativa do(s) procedimento(s)</h4>
          <div className="space-y-1.5">
            <Label>Descrição do diagnóstico</Label>
            <Textarea
              value={value.descricaoDiagnostico}
              onChange={(e) => patch({ descricaoDiagnostico: e.target.value })}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label>CID principal</Label>
              <Input value={value.cidPrincipal} onChange={(e) => patch({ cidPrincipal: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>CID secundário</Label>
              <Input value={value.cidSecundario} onChange={(e) => patch({ cidSecundario: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <Label>CID causas associadas</Label>
              <Input value={value.cidCausasAssociadas} onChange={(e) => patch({ cidCausasAssociadas: e.target.value.toUpperCase() })} />
            </div>
          </div>

          <div className="rounded-md border p-3 bg-muted/20 space-y-2">
            <div className="flex flex-wrap gap-2 items-end">
              <div className="min-w-[180px]">
                <Label>Buscar para preencher</Label>
                <Select value={cidTarget} onValueChange={(v: any) => setCidTarget(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="principal">CID principal</SelectItem>
                    <SelectItem value="secundario">CID secundário</SelectItem>
                    <SelectItem value="associadas">CID causas associadas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={cidQuery}
                  onChange={(e) => setCidQuery(e.target.value)}
                  placeholder="Buscar CID-10 por código ou descrição..."
                  className="pl-9"
                />
              </div>
            </div>
            {cidResults.length > 0 && (
              <div className="border rounded-md bg-background max-h-44 overflow-y-auto">
                {cidResults.map((cid) => (
                  <button
                    type="button"
                    key={cid.codigo}
                    className="w-full text-left px-3 py-2 hover:bg-muted/50 border-b last:border-b-0"
                    onClick={() =>
                      setCid(
                        cidTarget === "principal" ? "cidPrincipal" :
                        cidTarget === "secundario" ? "cidSecundario" : "cidCausasAssociadas",
                        cid.codigo
                      )
                    }
                  >
                    <span className="font-mono text-xs mr-2">{cid.codigo}</span>
                    <span className="text-sm">{cid.descricao}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={value.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} rows={3} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Procedimento principal</h4>
            <p className="text-xs text-muted-foreground">
              {principalLocked ? "Definido pelo modelo OCI." : "Selecione na base SIGTAP importada."}
            </p>
          </div>
          <SigtapProcedurePicker
            value={value.procedimentoPrincipal.codigo ? {
              codigo: value.procedimentoPrincipal.codigo,
              nome: value.procedimentoPrincipal.nome,
            } : null}
            onChange={(proc) => patch({
              procedimentoPrincipal: proc
                ? { codigo: proc.codigo, nome: proc.nome, quantidade: value.procedimentoPrincipal.quantidade || 1 }
                : { codigo: "", nome: "", quantidade: 1 },
            })}
            disabled={principalLocked}
            validation={validation}
          />
          <div className="w-36">
            <Label>Quantidade</Label>
            <Input
              type="number"
              min={1}
              value={value.procedimentoPrincipal.quantidade}
              onChange={(e) => patch({
                procedimentoPrincipal: {
                  ...value.procedimentoPrincipal,
                  quantidade: Math.max(1, Number(e.target.value) || 1),
                },
              })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Procedimentos secundários</h4>
            <p className="text-xs text-muted-foreground">Pesquise na base SIGTAP e adicione somente os procedimentos necessários.</p>
          </div>
          <SigtapProcedurePicker onChange={addSecondary} validation={validation} />
          {secondaryRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum procedimento secundário selecionado.</p>
          ) : (
            <div className="space-y-2">
              {secondaryRows.map((item, index) => (
                <div key={`${item.codigo}-${index}`} className="grid grid-cols-[1fr_100px_72px_40px] gap-2 items-center rounded-md border p-2">
                  <div className="min-w-0">
                    <div className="font-mono text-xs text-muted-foreground">{item.codigo}</div>
                    <div className="text-sm truncate">{item.nome}</div>
                  </div>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantidade}
                    onChange={(e) => updateSecondaryQty(index, Number(e.target.value))}
                  />
                  <div className="flex">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === 0}
                      onClick={() => moveSecondary(index, -1)}
                      title="Mover para cima"
                    >
                      <ArrowUp className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={index === secondaryRows.length - 1}
                      onClick={() => moveSecondary(index, 1)}
                      title="Mover para baixo"
                    >
                      <ArrowDown className="w-4 h-4" />
                    </Button>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => removeSecondary(index)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <h4 className="font-semibold">Autorização</h4>
            <p className="text-xs text-muted-foreground">Pode ser preenchida agora ou posteriormente, conforme o fluxo da unidade.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label>Nome do profissional autorizador</Label>
              <Input value={value.autorizacao.nomeAutorizador} onChange={(e) => patchAuth({ nomeAutorizador: e.target.value })} />
            </div>
            <div>
              <Label>Cód. órgão emissor</Label>
              <Input value={value.autorizacao.codigoOrgaoEmissor} onChange={(e) => patchAuth({ codigoOrgaoEmissor: e.target.value })} />
            </div>
            <div>
              <Label>Nº autorização/APAC</Label>
              <Input value={value.autorizacao.numeroAutorizacao} onChange={(e) => patchAuth({ numeroAutorizacao: e.target.value })} />
            </div>
            <div>
              <Label>Tipo do documento</Label>
              <Select value={value.autorizacao.documentoTipo} onValueChange={(v: any) => patchAuth({ documentoTipo: v })}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CNS">CNS</SelectItem>
                  <SelectItem value="CPF">CPF</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nº documento</Label>
              <Input value={value.autorizacao.documentoNumero} onChange={(e) => patchAuth({ documentoNumero: e.target.value })} />
            </div>
            <div>
              <Label>Data autorização</Label>
              <Input type="date" value={value.autorizacao.dataAutorizacao} onChange={(e) => patchAuth({ dataAutorizacao: e.target.value })} />
            </div>
            <div>
              <Label>Validade inicial</Label>
              <Input type="date" value={value.autorizacao.validadeInicio} onChange={(e) => patchAuth({ validadeInicio: e.target.value })} />
            </div>
            <div>
              <Label>Validade final</Label>
              <Input type="date" value={value.autorizacao.validadeFim} onChange={(e) => patchAuth({ validadeFim: e.target.value })} />
            </div>
            <div className="md:col-span-3">
              <Label>Assinatura/carimbo do autorizador</Label>
              <Input value={value.autorizacao.assinaturaCarimbo} onChange={(e) => patchAuth({ assinaturaCarimbo: e.target.value })} />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default StructuredOciForm;
