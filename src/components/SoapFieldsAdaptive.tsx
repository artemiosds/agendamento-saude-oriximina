import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { getSoapOptions, hasDropdownSoap, isMedico } from "@/data/soapOptionsByProfession";
import { FileText, ListChecks, Plus, X, Trash2 } from "lucide-react";

interface SoapValues {
  soap_subjetivo: string;
  soap_objetivo: string;
  soap_avaliacao: string;
  soap_plano: string;
}

interface CustomOptionWithId {
  id: string;
  opcao: string;
}

interface SoapFieldsAdaptiveProps {
  profissao: string | undefined;
  values: SoapValues;
  onChange: (field: keyof SoapValues, value: string) => void;
  soapErrors: boolean;
  onClearErrors: () => void;
  soapEnabled: boolean;
  onToggleSoap: (enabled: boolean) => void;
  highlightSOAP?: boolean;
  soapRef?: React.RefObject<HTMLDivElement>;
  customOptionsForField?: (campo: string) => string[];
  customOptionsWithId?: (campo: string) => CustomOptionWithId[];
  onAddCustomOption?: (campo: string, opcao: string) => void;
  onDeleteCustomOption?: (id: string) => void;
}

const FIELD_LABELS: { key: keyof SoapValues; soapKey: string; label: string; placeholder: string }[] = [
  { key: 'soap_subjetivo', soapKey: 'subjetivo', label: 'S — Subjetivo', placeholder: 'Relato do paciente...' },
  { key: 'soap_objetivo', soapKey: 'objetivo', label: 'O — Objetivo', placeholder: 'Dados observáveis, exame físico, sinais vitais...' },
  { key: 'soap_avaliacao', soapKey: 'avaliacao', label: 'A — Avaliação', placeholder: 'Análise clínica, hipóteses...' },
  { key: 'soap_plano', soapKey: 'plano', label: 'P — Plano', placeholder: 'Condutas, intervenções, próximos passos...' },
];

const SoapFieldsAdaptive: React.FC<SoapFieldsAdaptiveProps> = ({
  profissao,
  values,
  onChange,
  soapErrors,
  onClearErrors,
  soapEnabled,
  onToggleSoap,
  highlightSOAP,
  soapRef,
  customOptionsForField,
  customOptionsWithId,
  onAddCustomOption,
  onDeleteCustomOption,
}) => {
  const options = getSoapOptions(profissao);
  const isDropdownMode = hasDropdownSoap(profissao);
  const isMedicoMode = isMedico(profissao);

  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<string>>>({
    soap_subjetivo: new Set(),
    soap_objetivo: new Set(),
    soap_avaliacao: new Set(),
    soap_plano: new Set(),
  });

  // Track which field is adding a custom option
  const [addingField, setAddingField] = useState<string | null>(null);
  const [newOptionText, setNewOptionText] = useState("");
  // Track which field is showing custom options management
  const [managingField, setManagingField] = useState<string | null>(null);

  const handleToggleOption = (fieldKey: keyof SoapValues, option: string) => {
    onClearErrors();
    const soapFieldKey = FIELD_LABELS.find(f => f.key === fieldKey)?.soapKey || '';
    const defaultOpts = options?.[soapFieldKey as keyof typeof options] || [];
    const customOpts = customOptionsForField?.(soapFieldKey) || [];
    const allOptionTexts = [...defaultOpts, ...customOpts];

    setSelectedOptions(prev => {
      const newSet = new Set(prev[fieldKey]);
      if (newSet.has(option)) {
        newSet.delete(option);
      } else {
        newSet.add(option);
      }

      const currentText = values[fieldKey];
      const freeTextParts: string[] = [];
      const lines = currentText.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !allOptionTexts.some(opt => trimmed.startsWith(`• ${opt}`) || trimmed === opt)) {
          freeTextParts.push(trimmed);
        }
      }

      const selectedParts = Array.from(newSet).map(o => `• ${o}`);
      const combined = [...selectedParts, ...freeTextParts].join('\n');
      onChange(fieldKey, combined);

      return { ...prev, [fieldKey]: newSet };
    });
  };

  const handleApplyTemplate = () => {
    if (!options) return;
    onClearErrors();

    const newSelected: Record<string, Set<string>> = {
      soap_subjetivo: new Set(),
      soap_objetivo: new Set(),
      soap_avaliacao: new Set(),
      soap_plano: new Set(),
    };

    for (const field of FIELD_LABELS) {
      const fieldOptions = options[field.soapKey as keyof typeof options] || [];
      const defaults = fieldOptions.slice(0, Math.min(3, fieldOptions.length));
      newSelected[field.key] = new Set(defaults);
      onChange(field.key, defaults.map(o => `• ${o}`).join('\n'));
    }

    setSelectedOptions(newSelected);
  };

  const handleSaveCustomOption = (soapKey: string) => {
    if (!newOptionText.trim() || !onAddCustomOption) return;
    onAddCustomOption(soapKey, newOptionText.trim());
    setNewOptionText("");
    setAddingField(null);
  };

  return (
    <div
      ref={soapRef}
      className={`space-y-3 rounded-lg p-4 border transition-all duration-500 ${
        highlightSOAP
          ? 'border-primary ring-2 ring-primary/30 animate-pulse'
          : soapEnabled
            ? 'bg-primary/5 border-primary/20'
            : 'bg-muted/30 border-border'
      }`}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-primary flex items-center gap-2">
          <FileText className="w-4 h-4" />
          Evolução SOAP
          {!soapEnabled && <Badge variant="secondary" className="text-xs">Desativado</Badge>}
        </h3>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Registrar SOAP</span>
          <Switch checked={soapEnabled} onCheckedChange={onToggleSoap} />
        </div>
      </div>

      {!soapEnabled && (
        <p className="text-xs text-muted-foreground italic">
          O SOAP está desativado. O atendimento poderá ser finalizado sem preenchê-lo.
        </p>
      )}

      {soapEnabled && (
        <>
          {isDropdownMode && options && (
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={handleApplyTemplate} className="text-xs">
                <ListChecks className="w-3.5 h-3.5 mr-1" />
                Usar modelo padrão
              </Button>
              <span className="text-xs text-muted-foreground">
                {isMedicoMode ? 'Texto livre' : 'Seleção rápida + complemento'}
              </span>
            </div>
          )}

          {FIELD_LABELS.map((field) => {
            const defaultFieldOptions = options?.[field.soapKey as keyof typeof options] || [];
            const customFieldOptions = customOptionsForField?.(field.soapKey) || [];
            const allFieldOptions = [...defaultFieldOptions, ...customFieldOptions];
            const showDropdown = isDropdownMode && (defaultFieldOptions.length > 0 || customFieldOptions.length > 0);
            const customWithIds = customOptionsWithId?.(field.soapKey) || [];

            return (
              <div key={field.key} className="space-y-1.5">
                <Label>
                  {field.label}
                  {!isMedicoMode && soapEnabled && (
                    <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                  )}
                </Label>

                {showDropdown && (
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap gap-1.5">
                      {allFieldOptions.map((option) => {
                        const isSelected = selectedOptions[field.key]?.has(option);
                        const isCustom = customFieldOptions.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleToggleOption(field.key, option)}
                            className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                              isSelected
                                ? 'bg-primary/10 border-primary text-primary font-medium'
                                : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                            } ${isCustom ? 'border-dashed' : ''}`}
                          >
                            {isSelected && '✓ '}{option}
                          </button>
                        );
                      })}

                      {/* Add custom option button */}
                      {onAddCustomOption && (
                        <button
                          type="button"
                          onClick={() => {
                            setAddingField(addingField === field.soapKey ? null : field.soapKey);
                            setNewOptionText("");
                            setManagingField(null);
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-colors flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Adicionar
                        </button>
                      )}

                      {/* Manage custom options button */}
                      {onDeleteCustomOption && customWithIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setManagingField(managingField === field.soapKey ? null : field.soapKey);
                            setAddingField(null);
                          }}
                          className="text-xs px-2 py-1 rounded-md border border-muted-foreground/30 text-muted-foreground hover:bg-muted transition-colors flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          Gerenciar
                        </button>
                      )}
                    </div>

                    {/* Inline add form */}
                    {addingField === field.soapKey && (
                      <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
                        <Input
                          value={newOptionText}
                          onChange={(e) => setNewOptionText(e.target.value)}
                          placeholder="Nova opção..."
                          className="h-7 text-xs flex-1"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") { e.preventDefault(); handleSaveCustomOption(field.soapKey); }
                            if (e.key === "Escape") { setAddingField(null); setNewOptionText(""); }
                          }}
                        />
                        <Button type="button" size="sm" className="h-7 text-xs px-2" onClick={() => handleSaveCustomOption(field.soapKey)} disabled={!newOptionText.trim()}>
                          Salvar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setAddingField(null); setNewOptionText(""); }}>
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    )}

                    {/* Manage custom options list */}
                    {managingField === field.soapKey && customWithIds.length > 0 && (
                      <div className="p-2 rounded-md bg-muted/50 border space-y-1">
                        <p className="text-xs font-medium text-muted-foreground mb-1">Suas opções personalizadas:</p>
                        {customWithIds.map((opt) => (
                          <div key={opt.id} className="flex items-center justify-between gap-2 text-xs">
                            <span className="truncate">{opt.opcao}</span>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                              onClick={() => onDeleteCustomOption?.(opt.id)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <DebouncedTextarea
                  rows={isMedicoMode ? 5 : 4}
                  value={values[field.key]}
                  onChange={(e) => {
                    onClearErrors();
                    onChange(field.key, e.target.value);
                  }}
                  placeholder={showDropdown ? 'Complemento livre (opcional)...' : field.placeholder}
                  className={`min-h-[120px] ${
                    soapErrors && soapEnabled && !values[field.key]?.trim()
                      ? 'border-destructive border-2'
                      : ''
                  }`}
                />
                {soapErrors && soapEnabled && !values[field.key]?.trim() && !isMedicoMode && (
                  <span className="text-xs text-destructive">Campo obrigatório</span>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
};

export default SoapFieldsAdaptive;
