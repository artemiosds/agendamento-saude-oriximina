import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, X, Printer, Ban, Pill } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MedicationType {
  id: string;
  nome: string;
  principio_ativo: string;
  classe_terapeutica: string;
  apresentacao: string;
  dosagem_padrao: string;
  via_padrao: string;
  is_global: boolean;
  profissional_id: string | null;
  ativo: boolean;
}

interface MedicamentoPrescrito {
  id: string;
  nome: string;
  dosagem: string;
  via: string;
  posologia: string;
  duracao: string;
}

interface PrescricaoMedicamentosProps {
  profissionalId: string;
  value: MedicamentoPrescrito[];
  onChange: (meds: MedicamentoPrescrito[]) => void;
  pacienteNome?: string;
  pacienteCpf?: string;
  pacienteCns?: string;
  dataAtendimento?: string;
  profissionalNome?: string;
  profissionalConselho?: string;
  profissionalTipoConselho?: string;
  profissionalUfConselho?: string;
  unidadeNome?: string;
}

const CLASSES = [
  "Analgésico/Antipirético", "Anti-inflamatório/Analgésico", "Anti-inflamatório",
  "Opioide/Analgésico", "Opioide", "Corticosteroide", "Antibiótico",
  "Anti-hipertensivo", "Beta-bloqueador", "Antidiabético", "Hipolipemiante",
  "Antidepressivo", "Benzodiazepínico", "Anticonvulsivante/Analgésico",
  "Anticonvulsivante", "Relaxante Muscular", "Vitamina", "Suplemento",
  "Suplemento de Ferro", "Vitamina B9",
];

const VIAS = ["oral", "sublingual", "intramuscular", "intravenosa", "tópica", "retal", "inalatória", "nasal", "ocular"];

const PrescricaoMedicamentos: React.FC<PrescricaoMedicamentosProps> = ({
  profissionalId, value, onChange,
  pacienteNome, pacienteCpf, pacienteCns, dataAtendimento,
  profissionalNome, profissionalConselho, profissionalTipoConselho, profissionalUfConselho,
}) => {
  const [medTypes, setMedTypes] = useState<MedicationType[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newMed, setNewMed] = useState({ nome: "", principio_ativo: "", classe_terapeutica: CLASSES[0], apresentacao: "", dosagem_padrao: "", via_padrao: "oral" });
  const [savingNew, setSavingNew] = useState(false);
  const [selectedForDisable, setSelectedForDisable] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = async () => {
      const [{ data: meds }, { data: prefs }] = await Promise.all([
        (supabase as any).from("medications").select("*").eq("ativo", true),
        supabase.from("professional_preferences").select("*")
          .eq("profissional_id", profissionalId).eq("tipo", "medication").eq("desabilitado", true),
      ]);
      if (meds) setMedTypes(meds as MedicationType[]);
      if (prefs) setDisabledIds(new Set((prefs as any[]).map(p => p.item_id)));
    };
    load();
  }, [profissionalId]);

  const availableMeds = useMemo(() =>
    medTypes.filter(m => !disabledIds.has(m.id)),
    [medTypes, disabledIds]
  );

  const searchResults = useMemo(() => {
    if (searchTerm.length < 2) return [];
    const term = searchTerm.toLowerCase();
    return availableMeds.filter(m =>
      m.nome.toLowerCase().includes(term) ||
      m.principio_ativo.toLowerCase().includes(term) ||
      m.classe_terapeutica.toLowerCase().includes(term)
    ).slice(0, 15);
  }, [searchTerm, availableMeds]);

  const byClasse = useMemo(() => {
    const map: Record<string, MedicationType[]> = {};
    for (const m of availableMeds) {
      if (!map[m.classe_terapeutica]) map[m.classe_terapeutica] = [];
      map[m.classe_terapeutica].push(m);
    }
    return map;
  }, [availableMeds]);

  const addMed = useCallback((med: MedicationType) => {
    if (value.some(v => v.id === med.id)) return;
    onChange([...value, {
      id: med.id, nome: med.nome, dosagem: med.dosagem_padrao,
      via: med.via_padrao, posologia: "", duracao: ""
    }]);
  }, [value, onChange]);

  const removeMed = useCallback((id: string) => {
    onChange(value.filter(v => v.id !== id));
  }, [value, onChange]);

  const updateField = useCallback((id: string, field: keyof MedicamentoPrescrito, val: string) => {
    onChange(value.map(v => v.id === id ? { ...v, [field]: val } : v));
  }, [value, onChange]);

  const isSelected = useCallback((id: string) => value.some(v => v.id === id), [value]);

  const handleCreateMed = async () => {
    if (!newMed.nome.trim()) { toast.error("Nome do medicamento obrigatório"); return; }
    setSavingNew(true);
    try {
      const { data, error } = await (supabase as any).from("medications").insert({
        nome: newMed.nome.trim(),
        principio_ativo: newMed.principio_ativo.trim(),
        classe_terapeutica: newMed.classe_terapeutica,
        apresentacao: newMed.apresentacao.trim(),
        dosagem_padrao: newMed.dosagem_padrao.trim(),
        via_padrao: newMed.via_padrao,
        is_global: false,
        profissional_id: profissionalId,
      }).select().single();
      if (error) throw error;
      const created = data as MedicationType;
      setMedTypes(prev => [...prev, created]);
      addMed(created);
      setNewMed({ nome: "", principio_ativo: "", classe_terapeutica: CLASSES[0], apresentacao: "", dosagem_padrao: "", via_padrao: "oral" });
      toast.success("Medicamento cadastrado e adicionado!");
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err?.message || ""));
    }
    setSavingNew(false);
  };

  const handleDisableSelected = async () => {
    if (selectedForDisable.size === 0) return;
    const rows = Array.from(selectedForDisable).map(item_id => ({
      profissional_id: profissionalId, tipo: "medication", item_id, desabilitado: true,
    }));
    const { error } = await supabase.from("professional_preferences").upsert(rows, {
      onConflict: "profissional_id,tipo,item_id",
    });
    if (error) { toast.error("Erro ao desabilitar"); return; }
    setDisabledIds(prev => { const n = new Set(prev); selectedForDisable.forEach(id => n.add(id)); return n; });
    onChange(value.filter(v => !selectedForDisable.has(v.id)));
    setSelectedForDisable(new Set());
    toast.success("Medicamentos desabilitados para seu perfil.");
  };

  const handlePrint = () => {
    if (value.length === 0) { toast.error("Nenhum medicamento na lista."); return; }

    const rows = value.map((m, i) =>
      `<div style="margin-bottom:14px;padding-bottom:10px;border-bottom:1px dotted #999;">
        <p style="font-weight:bold;margin:0;">${i + 1}. ${m.nome} — ${m.dosagem || '—'}</p>
        <p style="margin:3px 0 0 16px;font-size:10pt;">Via: ${m.via || '—'} &nbsp;|&nbsp; Posologia: ${m.posologia || '—'}</p>
        <p style="margin:2px 0 0 16px;font-size:10pt;">Duração: ${m.duracao || '—'}</p>
      </div>`
    ).join("");

    const conselhoStr = profissionalTipoConselho && profissionalConselho
      ? `${profissionalTipoConselho} ${profissionalConselho}${profissionalUfConselho ? '/' + profissionalUfConselho : ''}`
      : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Receituário Médico</title>
<style>
  @page { size: A5 portrait; margin: 12mm; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Times New Roman', Georgia, serif; color: #000; background: #fff; font-size: 11pt; }
  .header { text-align: center; margin-bottom: 16px; border-bottom: 2px solid #000; padding-bottom: 10px; }
  .header h1 { font-size: 12pt; font-weight: bold; text-transform: uppercase; letter-spacing: 1px; }
  .header h2 { font-size: 10pt; font-weight: bold; margin-top: 2px; }
  .header h3 { font-size: 11pt; font-weight: bold; margin-top: 8px; text-decoration: underline; }
  .info { margin: 10px 0; font-size: 10pt; }
  .info p { margin: 3px 0; }
  .info span.label { font-weight: bold; }
  .prescricoes { margin: 14px 0; }
  .footer { margin-top: 30px; text-align: center; font-size: 10pt; }
  .signature { margin-top: 40px; border-top: 1px solid #000; display: inline-block; padding-top: 4px; min-width: 250px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
  <h2>Centro Especializado em Reabilitação Nível II</h2>
  <h3>Receituário Médico</h3>
</div>
<div class="info">
  <p><span class="label">Paciente:</span> ${pacienteNome || '—'}</p>
  <p><span class="label">CPF:</span> ${pacienteCpf || '—'} &nbsp;&nbsp; <span class="label">CNS:</span> ${pacienteCns || '—'}</p>
  <p><span class="label">Data:</span> ${dataAtendimento ? new Date(dataAtendimento + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}</p>
  <p><span class="label">Convênio:</span> SUS</p>
</div>
<div class="prescricoes">${rows}</div>
<div class="footer">
  <p>${profissionalNome || ''}</p>
  <p>${conselhoStr}</p>
  <div class="signature">Assinatura / Carimbo</div>
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 400); }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Pill className="w-4 h-4 text-primary" />
            Prescrição de Medicamentos
            {value.length > 0 && <Badge variant="secondary" className="text-xs">{value.length}</Badge>}
          </CardTitle>
          <div className="flex gap-1">
            {value.length > 0 && (
              <Button type="button" variant="outline" size="sm" onClick={handlePrint}>
                <Printer className="w-3.5 h-3.5 mr-1" /> Imprimir
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 pt-0">
        <Tabs defaultValue="buscar" className="w-full">
          <TabsList className="w-full grid grid-cols-3 h-8">
            <TabsTrigger value="buscar" className="text-xs">🔍 Buscar</TabsTrigger>
            <TabsTrigger value="classe" className="text-xs">📋 Por Classe</TabsTrigger>
            <TabsTrigger value="cadastrar" className="text-xs">+ Cadastrar</TabsTrigger>
          </TabsList>

          <TabsContent value="buscar" className="mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou classe terapêutica..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                className="pl-8 h-8 text-sm"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map(med => (
                    <button key={med.id} type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between ${isSelected(med.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => { addMed(med); setSearchTerm(""); setSearchOpen(false); }}
                      disabled={isSelected(med.id)}>
                      <div>
                        <span className="font-medium">{med.nome}</span>
                        <span className="text-xs text-muted-foreground ml-2">({med.apresentacao})</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{med.classe_terapeutica}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchOpen && searchTerm.length >= 2 && searchResults.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-sm text-muted-foreground text-center">
                  Nenhum medicamento encontrado.
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="classe" className="mt-2">
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {Object.entries(byClasse).sort(([a],[b]) => a.localeCompare(b)).map(([classe, meds]) => (
                <div key={classe}>
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{classe}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1">
                    {meds.map(med => (
                      <label key={med.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                        <Checkbox
                          checked={isSelected(med.id)}
                          onCheckedChange={checked => { if (checked) addMed(med); else removeMed(med.id); }}
                        />
                        <span className="truncate">{med.nome}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {availableMeds.length > 0 && (
              <div className="mt-3 pt-2 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <Button type="button" variant="outline" size="sm"
                    className="text-xs text-destructive border-destructive/30"
                    disabled={selectedForDisable.size === 0}
                    onClick={handleDisableSelected}>
                    <Ban className="w-3 h-3 mr-1" /> Desabilitar ({selectedForDisable.size})
                  </Button>
                  <p className="text-xs text-muted-foreground">Marque para desabilitar do seu perfil:</p>
                </div>
                <div className="max-h-32 overflow-y-auto grid grid-cols-2 gap-1">
                  {availableMeds.map(med => (
                    <label key={`dis-${med.id}`} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-destructive/5 rounded px-1 py-0.5">
                      <Checkbox
                        checked={selectedForDisable.has(med.id)}
                        onCheckedChange={checked => {
                          setSelectedForDisable(prev => {
                            const n = new Set(prev);
                            if (checked) n.add(med.id); else n.delete(med.id);
                            return n;
                          });
                        }}
                      />
                      <span className="truncate text-muted-foreground">{med.nome}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="cadastrar" className="mt-2 space-y-3">
            <div>
              <Label className="text-xs">Nome do Medicamento *</Label>
              <Input value={newMed.nome} onChange={e => setNewMed(p => ({ ...p, nome: e.target.value }))} className="h-8 text-sm" placeholder="Ex: Pregabalina" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Princípio Ativo</Label>
                <Input value={newMed.principio_ativo} onChange={e => setNewMed(p => ({ ...p, principio_ativo: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Classe Terapêutica</Label>
                <Select value={newMed.classe_terapeutica} onValueChange={v => setNewMed(p => ({ ...p, classe_terapeutica: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{CLASSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Apresentação</Label>
                <Input value={newMed.apresentacao} onChange={e => setNewMed(p => ({ ...p, apresentacao: e.target.value }))} className="h-8 text-sm" placeholder="Comp 75mg" />
              </div>
              <div>
                <Label className="text-xs">Dosagem Padrão</Label>
                <Input value={newMed.dosagem_padrao} onChange={e => setNewMed(p => ({ ...p, dosagem_padrao: e.target.value }))} className="h-8 text-sm" placeholder="75mg" />
              </div>
              <div>
                <Label className="text-xs">Via</Label>
                <Select value={newMed.via_padrao} onValueChange={v => setNewMed(p => ({ ...p, via_padrao: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{VIAS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" onClick={handleCreateMed} disabled={savingNew} size="sm" className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar e Adicionar
            </Button>
          </TabsContent>
        </Tabs>

        {/* LISTA PRESCRITA */}
        {value.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-foreground mb-2">Medicamentos Prescritos ({value.length})</p>
            <div className="space-y-2">
              {value.map(med => (
                <div key={med.id} className="bg-muted/30 rounded-md p-2 border">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{med.nome}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => removeMed(med.id)}>
                      <X className="w-3.5 h-3.5 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Dosagem</Label>
                      <Input value={med.dosagem} onChange={e => updateField(med.id, 'dosagem', e.target.value)} className="h-7 text-xs" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Via</Label>
                      <Select value={med.via || "oral"} onValueChange={v => updateField(med.id, 'via', v)}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{VIAS.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Posologia</Label>
                      <Input value={med.posologia} onChange={e => updateField(med.id, 'posologia', e.target.value)} className="h-7 text-xs" placeholder="1x/dia" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Duração</Label>
                      <Input value={med.duracao} onChange={e => updateField(med.id, 'duracao', e.target.value)} className="h-7 text-xs" placeholder="7 dias" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default PrescricaoMedicamentos;
