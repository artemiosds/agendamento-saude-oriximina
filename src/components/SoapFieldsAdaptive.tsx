import React, { useState } from "react";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { getSoapOptions, hasDropdownSoap, isMedico } from "@/data/soapOptionsByProfession";
import { FileText, ListChecks } from "lucide-react";

interface SoapValues {
  soap_subjetivo: string;
  soap_objetivo: string;
  soap_avaliacao: string;
  soap_plano: string;
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
}) => {
  const options = getSoapOptions(profissao);
  const isDropdownMode = hasDropdownSoap(profissao);
  const isMedicoMode = isMedico(profissao);

  // Track selected options per field (for dropdown mode)
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Set<string>>>({
    soap_subjetivo: new Set(),
    soap_objetivo: new Set(),
    soap_avaliacao: new Set(),
    soap_plano: new Set(),
  });

  const handleToggleOption = (fieldKey: keyof SoapValues, option: string) => {
    onClearErrors();
    const soapFieldKey = FIELD_LABELS.find(f => f.key === fieldKey)?.soapKey || '';
    const optionsForField = options?.[soapFieldKey as keyof typeof options] || [];
    
    setSelectedOptions(prev => {
      const newSet = new Set(prev[fieldKey]);
      if (newSet.has(option)) {
        newSet.delete(option);
      } else {
        newSet.add(option);
      }
      
      // Build the text value: selected options + any existing free text
      const currentText = values[fieldKey];
      // Extract free text (text after the last selected option marker)
      const allOptionTexts = optionsForField;
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

    // Select first 2-3 common options per field
    for (const field of FIELD_LABELS) {
      const fieldOptions = options[field.soapKey as keyof typeof options] || [];
      const defaults = fieldOptions.slice(0, Math.min(3, fieldOptions.length));
      newSelected[field.key] = new Set(defaults);
      onChange(field.key, defaults.map(o => `• ${o}`).join('\n'));
    }
    
    setSelectedOptions(newSelected);
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
      {/* Header with toggle */}
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
          {/* Template button for dropdown professions */}
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
            const fieldOptions = options?.[field.soapKey as keyof typeof options] || [];
            const showDropdown = isDropdownMode && fieldOptions.length > 0;

            return (
              <div key={field.key} className="space-y-1.5">
                <Label>
                  {field.label}
                  {!isMedicoMode && soapEnabled && (
                    <span className="text-muted-foreground text-xs ml-1">(opcional)</span>
                  )}
                </Label>

                {/* Dropdown options as checkboxes */}
                {showDropdown && (
                  <div className="flex flex-wrap gap-1.5 mb-1.5">
                    {fieldOptions.map((option) => {
                      const isSelected = selectedOptions[field.key]?.has(option);
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => handleToggleOption(field.key, option)}
                          className={`text-xs px-2 py-1 rounded-md border transition-colors ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-primary font-medium'
                              : 'bg-background border-border text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                          }`}
                        >
                          {isSelected && '✓ '}{option}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Text area (complement for dropdown or main input for médico) */}
                <Textarea
                  rows={isMedicoMode ? 3 : 2}
                  value={values[field.key]}
                  onChange={(e) => {
                    onClearErrors();
                    onChange(field.key, e.target.value);
                  }}
                  placeholder={showDropdown ? 'Complemento livre (opcional)...' : field.placeholder}
                  className={
                    soapErrors && soapEnabled && !values[field.key]?.trim()
                      ? 'border-destructive border-2'
                      : ''
                  }
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
