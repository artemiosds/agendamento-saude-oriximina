import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Plus, X, Printer, Ban, FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { openPrintDocument } from "@/lib/printLayout";

interface ExamType {
  id: string;
  nome: string;
  codigo_sus: string;
  categoria: string;
  is_global: boolean;
  profissional_id: string | null;
  ativo: boolean;
}

interface ExameSolicitado {
  id: string;
  nome: string;
  codigo_sus: string;
  indicacao: string;
}

interface SolicitacaoExamesProps {
  profissionalId: string;
  value: ExameSolicitado[];
  onChange: (exames: ExameSolicitado[]) => void;
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

const CATEGORIAS = [
  "Hematologia", "Bioquímica", "Radiologia", "Ultrassonografia",
  "Tomografia", "Ressonância Magnética", "Cardiologia", "Neurologia",
  "Pneumologia", "Densitometria", "Reumatologia", "Endocrinologia", "Urinálise",
];

const SolicitacaoExames: React.FC<SolicitacaoExamesProps> = ({
  profissionalId,
  value,
  onChange,
  pacienteNome,
  pacienteCpf,
  pacienteCns,
  dataAtendimento,
  profissionalNome,
  profissionalConselho,
  profissionalTipoConselho,
  profissionalUfConselho,
  unidadeNome,
}) => {
  const [examTypes, setExamTypes] = useState<ExamType[]>([]);
  const [disabledIds, setDisabledIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [newExam, setNewExam] = useState({ nome: "", codigo_sus: "", categoria: CATEGORIAS[0] });
  const [savingNew, setSavingNew] = useState(false);
  const [selectedForDisable, setSelectedForDisable] = useState<Set<string>>(new Set());

  // Load all exam types + preferences once
  useEffect(() => {
    const load = async () => {
      const [{ data: types }, { data: prefs }] = await Promise.all([
        supabase.from("exam_types").select("*").eq("ativo", true),
        supabase.from("professional_preferences").select("*")
          .eq("profissional_id", profissionalId).eq("tipo", "exam").eq("desabilitado", true),
      ]);
      if (types) setExamTypes(types as ExamType[]);
      if (prefs) setDisabledIds(new Set((prefs as any[]).map(p => p.item_id)));
    };
    load();
  }, [profissionalId]);

  // Available exams (not disabled)
  const availableExams = useMemo(() =>
    examTypes.filter(e => !disabledIds.has(e.id)),
    [examTypes, disabledIds]
  );

  // Search results
  const searchResults = useMemo(() => {
    if (searchTerm.length < 2) return [];
    const term = searchTerm.toLowerCase();
    return availableExams.filter(e =>
      e.nome.toLowerCase().includes(term) ||
      e.codigo_sus.toLowerCase().includes(term) ||
      e.categoria.toLowerCase().includes(term)
    ).slice(0, 15);
  }, [searchTerm, availableExams]);

  // Group by category
  const byCategoria = useMemo(() => {
    const map: Record<string, ExamType[]> = {};
    for (const cat of CATEGORIAS) map[cat] = [];
    for (const e of availableExams) {
      if (map[e.categoria]) map[e.categoria].push(e);
      else {
        map[e.categoria] = [e];
      }
    }
    return map;
  }, [availableExams]);

  const addExam = useCallback((exam: ExamType) => {
    if (value.some(v => v.id === exam.id)) return;
    onChange([...value, { id: exam.id, nome: exam.nome, codigo_sus: exam.codigo_sus, indicacao: "" }]);
  }, [value, onChange]);

  const removeExam = useCallback((id: string) => {
    onChange(value.filter(v => v.id !== id));
  }, [value, onChange]);

  const updateIndicacao = useCallback((id: string, indicacao: string) => {
    onChange(value.map(v => v.id === id ? { ...v, indicacao } : v));
  }, [value, onChange]);

  const isSelected = useCallback((id: string) => value.some(v => v.id === id), [value]);

  const handleCreateExam = async () => {
    if (!newExam.nome.trim()) { toast.error("Nome do exame obrigatório"); return; }
    setSavingNew(true);
    try {
      const { data, error } = await supabase.from("exam_types").insert({
        nome: newExam.nome.trim(),
        codigo_sus: newExam.codigo_sus.trim(),
        categoria: newExam.categoria,
        is_global: false,
        profissional_id: profissionalId,
      }).select().single();
      if (error) throw error;
      const created = data as ExamType;
      setExamTypes(prev => [...prev, created]);
      addExam(created);
      setNewExam({ nome: "", codigo_sus: "", categoria: CATEGORIAS[0] });
      toast.success("Exame cadastrado e adicionado à lista!");
    } catch (err: any) {
      toast.error("Erro ao cadastrar: " + (err?.message || ""));
    }
    setSavingNew(false);
  };

  const handleDisableSelected = async () => {
    if (selectedForDisable.size === 0) return;
    const rows = Array.from(selectedForDisable).map(item_id => ({
      profissional_id: profissionalId,
      tipo: "exam",
      item_id,
      desabilitado: true,
    }));
    const { error } = await supabase.from("professional_preferences").upsert(rows, {
      onConflict: "profissional_id,tipo,item_id",
    });
    if (error) { toast.error("Erro ao desabilitar"); return; }
    setDisabledIds(prev => { const n = new Set(prev); selectedForDisable.forEach(id => n.add(id)); return n; });
    // Remove disabled from selection list
    onChange(value.filter(v => !selectedForDisable.has(v.id)));
    setSelectedForDisable(new Set());
    toast.success("Exames desabilitados para seu perfil.");
  };

  const handlePrint = () => {
    if (value.length === 0) { toast.error("Nenhum exame na lista."); return; }

    const rows = value.map((e, i) =>
      `<tr>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${i + 1}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${e.nome}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd;text-align:center">${e.codigo_sus || '—'}</td>
        <td style="padding:6px 8px;border-bottom:1px solid #ddd">${e.indicacao || '—'}</td>
      </tr>`
    ).join("");

    const conselhoStr = profissionalTipoConselho && profissionalConselho
      ? `${profissionalTipoConselho} ${profissionalConselho}${profissionalUfConselho ? '/' + profissionalUfConselho : ''}`
      : '';

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Solicitação de Exames</title>
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
  table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
  thead th { background: #f0f0f0; padding: 6px 8px; border-bottom: 2px solid #000; text-align: left; font-weight: bold; }
  .footer { margin-top: 30px; text-align: center; font-size: 10pt; }
  .signature { margin-top: 40px; border-top: 1px solid #000; display: inline-block; padding-top: 4px; min-width: 250px; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<div class="header">
  <h1>Secretaria Municipal de Saúde de Oriximiná</h1>
  <h2>Centro Especializado em Reabilitação Nível II</h2>
  <h3>Solicitação de Exames</h3>
</div>
<div class="info">
  <p><span class="label">Paciente:</span> ${pacienteNome || '—'}</p>
  <p><span class="label">CPF:</span> ${pacienteCpf || '—'} &nbsp;&nbsp; <span class="label">CNS:</span> ${pacienteCns || '—'}</p>
  <p><span class="label">Data:</span> ${dataAtendimento ? new Date(dataAtendimento + 'T12:00:00').toLocaleDateString('pt-BR') : new Date().toLocaleDateString('pt-BR')}</p>
  <p><span class="label">Convênio:</span> SUS</p>
</div>
<table>
  <thead><tr><th style="width:30px">#</th><th>Exame</th><th style="width:90px">Código SUS</th><th>Indicação Clínica</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <p>${profissionalNome || ''}</p>
  <p>${conselhoStr}</p>
  <div class="signature">Assinatura / Carimbo</div>
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 400);
    }
  };

  return (
    <Card className="border shadow-sm">
      <CardHeader className="pb-3 pt-4 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-primary" />
            Solicitação de Exames
            {value.length > 0 && (
              <Badge variant="secondary" className="text-xs">{value.length}</Badge>
            )}
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
            <TabsTrigger value="categoria" className="text-xs">📋 Categorias</TabsTrigger>
            <TabsTrigger value="cadastrar" className="text-xs">+ Cadastrar</TabsTrigger>
          </TabsList>

          {/* TAB BUSCAR */}
          <TabsContent value="buscar" className="mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar exame por nome, código SUS ou categoria..."
                value={searchTerm}
                onChange={e => { setSearchTerm(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                className="pl-8 h-8 text-sm"
              />
              {searchOpen && searchResults.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map(exam => (
                    <button
                      key={exam.id}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between ${isSelected(exam.id) ? 'bg-primary/5' : ''}`}
                      onClick={() => { addExam(exam); setSearchTerm(""); setSearchOpen(false); }}
                      disabled={isSelected(exam.id)}
                    >
                      <div>
                        <span className="font-medium">{exam.nome}</span>
                        {exam.codigo_sus && <span className="text-xs text-muted-foreground ml-2">({exam.codigo_sus})</span>}
                      </div>
                      <span className="text-xs text-muted-foreground">{exam.categoria}</span>
                    </button>
                  ))}
                </div>
              )}
              {searchOpen && searchTerm.length >= 2 && searchResults.length === 0 && (
                <div className="absolute z-10 w-full mt-1 bg-background border rounded-md shadow-lg p-3 text-sm text-muted-foreground text-center">
                  Nenhum exame encontrado.
                </div>
              )}
            </div>
          </TabsContent>

          {/* TAB CATEGORIAS */}
          <TabsContent value="categoria" className="mt-2">
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {CATEGORIAS.map(cat => {
                const exams = byCategoria[cat] || [];
                if (exams.length === 0) return null;
                return (
                  <div key={cat}>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">{cat}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                      {exams.map(exam => (
                        <label key={exam.id} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-muted/50 rounded px-1.5 py-1">
                          <Checkbox
                            checked={isSelected(exam.id)}
                            onCheckedChange={checked => {
                              if (checked) addExam(exam);
                              else removeExam(exam.id);
                            }}
                          />
                          <span className="truncate">{exam.nome}</span>
                          {exam.codigo_sus && <span className="text-xs text-muted-foreground shrink-0">({exam.codigo_sus})</span>}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {selectedForDisable.size > 0 || availableExams.length > 0 ? (
              <div className="mt-3 pt-2 border-t flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="text-xs text-destructive border-destructive/30"
                  disabled={selectedForDisable.size === 0}
                  onClick={handleDisableSelected}
                >
                  <Ban className="w-3 h-3 mr-1" />
                  Desabilitar selecionados ({selectedForDisable.size})
                </Button>
                <p className="text-xs text-muted-foreground">Marque abaixo para desabilitar do seu perfil:</p>
              </div>
            ) : null}
            {availableExams.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto grid grid-cols-2 gap-1">
                {availableExams.map(exam => (
                  <label key={`dis-${exam.id}`} className="flex items-center gap-1.5 text-xs cursor-pointer hover:bg-destructive/5 rounded px-1 py-0.5">
                    <Checkbox
                      checked={selectedForDisable.has(exam.id)}
                      onCheckedChange={checked => {
                        setSelectedForDisable(prev => {
                          const n = new Set(prev);
                          if (checked) n.add(exam.id); else n.delete(exam.id);
                          return n;
                        });
                      }}
                    />
                    <span className="truncate text-muted-foreground">{exam.nome}</span>
                  </label>
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB CADASTRAR */}
          <TabsContent value="cadastrar" className="mt-2 space-y-3">
            <div>
              <Label className="text-xs">Nome do Exame *</Label>
              <Input value={newExam.nome} onChange={e => setNewExam(p => ({ ...p, nome: e.target.value }))} className="h-8 text-sm" placeholder="Ex: Vitamina K" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Código SUS</Label>
                <Input value={newExam.codigo_sus} onChange={e => setNewExam(p => ({ ...p, codigo_sus: e.target.value }))} className="h-8 text-sm" />
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={newExam.categoria} onValueChange={v => setNewExam(p => ({ ...p, categoria: v }))}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="button" onClick={handleCreateExam} disabled={savingNew} size="sm" className="w-full">
              <Plus className="w-3.5 h-3.5 mr-1" /> Cadastrar e Adicionar
            </Button>
          </TabsContent>
        </Tabs>

        {/* LISTA FINAL */}
        {value.length > 0 && (
          <div className="mt-3 border-t pt-3">
            <p className="text-xs font-semibold text-foreground mb-2">Exames Solicitados ({value.length})</p>
            <div className="space-y-2">
              {value.map(exam => (
                <div key={exam.id} className="flex items-start gap-2 bg-muted/30 rounded-md p-2 border">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{exam.nome}</span>
                      {exam.codigo_sus && <span className="text-xs text-muted-foreground shrink-0">({exam.codigo_sus})</span>}
                    </div>
                    <Input
                      placeholder="Indicação clínica..."
                      value={exam.indicacao}
                      onChange={e => updateIndicacao(exam.id, e.target.value)}
                      className="mt-1 h-7 text-xs"
                    />
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="shrink-0 h-7 w-7 text-destructive" onClick={() => removeExam(exam.id)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SolicitacaoExames;
