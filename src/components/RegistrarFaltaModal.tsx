import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X } from "lucide-react";

interface RegistrarFaltaModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agendamento: {
    id: string;
    pacienteId: string;
    pacienteNome: string;
    profissionalId: string;
    profissionalNome: string;
    data: string;
    hora: string;
    unidadeId: string;
    tipo: string;
  } | null;
  onConfirm: (dados: {
    tipoFalta: "justificada" | "injustificada";
    documento?: string;
    descricao?: string;
    anexoUrl?: string;
  }) => Promise<void>;
}

export const RegistrarFaltaModal: React.FC<RegistrarFaltaModalProps> = ({
  open,
  onOpenChange,
  agendamento,
  onConfirm,
}) => {
  const [tipoFalta, setTipoFalta] = useState<"justificada" | "injustificada">("injustificada");
  const [documento, setDocumento] = useState("");
  const [documentoOutro, setDocumentoOutro] = useState("");
  const [descricao, setDescricao] = useState("");
  const [anexoFile, setAnexoFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setTipoFalta("injustificada");
    setDocumento("");
    setDocumentoOutro("");
    setDescricao("");
    setAnexoFile(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    if (!agendamento) return;

    setLoading(true);
    try {
      let anexoUrl: string | undefined;

      // Upload attachment if provided
      if (anexoFile) {
        const ext = anexoFile.name.split(".").pop() || "jpg";
        const path = `faltas/${agendamento.id}_${Date.now()}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from("sms")
          .upload(path, anexoFile, { upsert: true });

        if (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error("Erro ao enviar anexo. Falta será registrada sem o documento.");
        } else {
          const { data: urlData } = supabase.storage.from("sms").getPublicUrl(path);
          anexoUrl = urlData?.publicUrl;
        }
      }

      const docFinal = documento === "outro" ? documentoOutro : documento;

      await onConfirm({
        tipoFalta,
        documento: tipoFalta === "justificada" ? docFinal : undefined,
        descricao: descricao.trim() || undefined,
        anexoUrl,
      });

      resetForm();
    } catch (err: any) {
      console.error("Erro ao registrar falta:", err);
      toast.error(err?.message || "Erro ao registrar falta.");
    } finally {
      setLoading(false);
    }
  };

  if (!agendamento) return null;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            ❌ Registrar Falta
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-1">
            <p className="text-sm font-medium">{agendamento.pacienteNome}</p>
            <p className="text-xs text-muted-foreground">
              {new Date(agendamento.data + "T12:00:00").toLocaleDateString("pt-BR")} às {agendamento.hora} — {agendamento.profissionalNome}
            </p>
          </div>

          {/* Tipo de falta */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Tipo de falta *</Label>
            <RadioGroup value={tipoFalta} onValueChange={(v) => setTipoFalta(v as any)}>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="justificada" id="justificada" />
                <Label htmlFor="justificada" className="text-sm cursor-pointer">Justificada</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="injustificada" id="injustificada" />
                <Label htmlFor="injustificada" className="text-sm cursor-pointer">Injustificada</Label>
              </div>
            </RadioGroup>
          </div>

          {/* Documento (if justificada) */}
          {tipoFalta === "justificada" && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Documento apresentado</Label>
              <Select value={documento} onValueChange={setDocumento}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="atestado">Atestado</SelectItem>
                  <SelectItem value="declaracao">Declaração</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
              {documento === "outro" && (
                <Input
                  placeholder="Especifique o documento..."
                  value={documentoOutro}
                  onChange={(e) => setDocumentoOutro(e.target.value)}
                  maxLength={100}
                />
              )}
            </div>
          )}

          {/* Descrição/motivo */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Descrição / Motivo (opcional)</Label>
            <Textarea
              placeholder="Descreva o motivo da falta..."
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={500}
              rows={3}
            />
          </div>

          {/* Anexo */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Anexo (opcional)</Label>
            {anexoFile ? (
              <div className="flex items-center gap-2 bg-muted/50 rounded-lg px-3 py-2">
                <Upload className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate flex-1">{anexoFile.name}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 w-6 p-0"
                  onClick={() => setAnexoFile(null)}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="file"
                  accept="image/*,.pdf"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > 5 * 1024 * 1024) {
                        toast.error("Arquivo muito grande. Máximo: 5MB");
                        return;
                      }
                      setAnexoFile(file);
                    }
                  }}
                />
                <Button variant="outline" className="w-full text-sm" type="button">
                  <Upload className="w-4 h-4 mr-2" /> Selecionar arquivo
                </Button>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Imagem ou PDF, máx. 5MB</p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? "Registrando..." : "Registrar falta"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
