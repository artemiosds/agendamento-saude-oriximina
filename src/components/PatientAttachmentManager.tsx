import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  FileUp, 
  FileText, 
  Trash2, 
  Download, 
  Eye, 
  Loader2, 
  ExternalLink,
  File as FileIcon,
  ImageIcon,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface PatientAttachment {
  id: string;
  paciente_id: string;
  nome_arquivo: string;
  nome_original: string;
  tipo_documento: string;
  mime_type: string;
  tamanho_bytes: number;
  storage_path: string;
  created_at: string;
  uploaded_by_name?: string;
  origem: string;
}

interface Props {
  pacienteId: string;
  unidadeId?: string;
}

const PatientAttachmentManager: React.FC<Props> = ({ pacienteId, unidadeId }) => {
  const { user } = useAuth();
  const [attachments, setAttachments] = useState<PatientAttachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewType, setPreviewType] = useState<string | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);

  const loadAttachments = useCallback(async () => {
    if (!pacienteId) return;
    setLoading(true);
    try {
      // Usando query direta para garantir que pegamos os dados mais recentes
      const { data, error } = await supabase
        .from("patient_documents")
        .select(`
          id, 
          paciente_id, 
          nome_arquivo, 
          nome_original, 
          tipo_documento, 
          mime_type, 
          tamanho_bytes, 
          storage_path, 
          created_at, 
          origem
        `)
        .eq("paciente_id", pacienteId)
        .eq("ativo", true)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setAttachments(data as any[] || []);
    } catch (error: any) {
      console.error("Erro ao carregar anexos:", error);
      toast.error("Erro ao carregar lista de documentos.");
    } finally {
      setLoading(false);
    }
  }, [pacienteId]);

  useEffect(() => {
    loadAttachments();
  }, [loadAttachments]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Limite de 10MB
    if (file.size > 10 * 1024 * 1024) {
      toast.error("O arquivo é muito grande. Máximo permitido: 10MB");
      return;
    }

    setUploading(true);
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${unidadeId || "global"}/${pacienteId}/documentos/${fileName}`;

      // 1. Upload para o Storage
      const { error: uploadError } = await supabase.storage
        .from("patient-documents")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Registro no Banco de Dados
      const { error: dbError } = await supabase
        .from("patient_documents")
        .insert({
          paciente_id: pacienteId,
          unidade_id: unidadeId || null,
          nome_arquivo: fileName,
          nome_original: file.name,
          mime_type: file.type,
          tamanho_bytes: file.size,
          storage_path: filePath,
          uploaded_by: user?.id,
          tipo_documento: "Anexo", // Pode ser parametrizado no futuro
          origem: "anexado"
        });

      if (dbError) throw dbError;

      toast.success("Arquivo anexado com sucesso!");
      loadAttachments();
      
      // Limpar input
      e.target.value = "";
    } catch (error: any) {
      console.error("Erro no upload:", error);
      toast.error("Falha ao anexar arquivo: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (attachment: PatientAttachment) => {
    try {
      const { data, error } = await supabase.storage
        .from("patient-documents")
        .createSignedUrl(attachment.storage_path, 60);

      if (error) throw error;
      
      // Forçar download
      const link = document.createElement("a");
      link.href = data.signedUrl;
      link.download = attachment.nome_original;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error: any) {
      toast.error("Erro ao gerar link de download.");
    }
  };

  const handleView = async (attachment: PatientAttachment) => {
    try {
      const { data, error } = await supabase.storage
        .from("patient-documents")
        .createSignedUrl(attachment.storage_path, 3600); // 1 hora de acesso

      if (error) throw error;

      if (attachment.mime_type.includes("image") || attachment.mime_type === "application/pdf") {
        setPreviewUrl(data.signedUrl);
        setPreviewType(attachment.mime_type);
        setPreviewName(attachment.nome_original);
      } else {
        // Formatos que não têm preview direto (ex: docx)
        window.open(data.signedUrl, "_blank");
      }
    } catch (error: any) {
      toast.error("Erro ao abrir visualização.");
    }
  };

  const handleDelete = async (attachment: PatientAttachment) => {
    if (!window.confirm(`Tem certeza que deseja remover o documento "${attachment.nome_original}"?`)) {
      return;
    }

    try {
      // Soft delete no banco
      const { error } = await supabase
        .from("patient_documents")
        .update({ 
          ativo: false, 
          deleted_at: new Date().toISOString(),
          deleted_by: user?.id
        })
        .eq("id", attachment.id);

      if (error) throw error;

      toast.success("Documento removido.");
      loadAttachments();
    } catch (error: any) {
      toast.error("Erro ao remover documento.");
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes("image")) return <ImageIcon className="w-4 h-4 text-blue-500" />;
    if (mimeType === "application/pdf") return <FileText className="w-4 h-4 text-red-500" />;
    return <FileIcon className="w-4 h-4 text-gray-500" />;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between bg-muted/30 p-3 rounded-lg border border-dashed border-primary/30">
        <div className="space-y-1">
          <h4 className="text-sm font-semibold flex items-center gap-2">
            <FileUp className="w-4 h-4" /> Anexar Novos Documentos
          </h4>
          <p className="text-xs text-muted-foreground">PDF, JPEG, PNG, DOCX até 10MB</p>
        </div>
        <label className="relative cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2">
          {uploading ? (
            <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
          ) : (
            <><FileUp className="w-4 h-4" /> Selecionar Arquivo</>
          )}
          <input
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            disabled={uploading || !pacienteId}
            accept=".pdf,.jpg,.jpeg,.png,.docx"
          />
        </label>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
          <FileText className="w-4 h-4" /> Arquivos Anexados ({attachments.length})
        </h4>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <Loader2 className="w-8 h-8 animate-spin mb-2" />
            <p className="text-sm">Carregando documentos...</p>
          </div>
        ) : attachments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 border rounded-lg bg-muted/10 border-dashed">
            <FileIcon className="w-10 h-10 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">Nenhum documento anexado ainda.</p>
          </div>
        ) : (
          <div className="grid gap-2">
            {attachments.map((att) => (
              <div 
                key={att.id} 
                className="group flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/5 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="p-2 rounded-md bg-muted/50">
                    {getFileIcon(att.mime_type)}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate max-w-[200px] sm:max-w-md" title={att.nome_original}>
                      {att.nome_original}
                    </p>
                    <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                      <span>{formatSize(att.tamanho_bytes)}</span>
                      <span>•</span>
                      <span>{format(new Date(att.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span>
                      <span>•</span>
                      <span className="capitalize">{att.origem}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-primary" 
                    onClick={() => handleView(att)}
                    title="Visualizar"
                  >
                    <Eye className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-primary" 
                    onClick={() => handleDownload(att)}
                    title="Baixar"
                  >
                    <Download className="w-4 h-4" />
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-destructive" 
                    onClick={() => handleDelete(att)}
                    title="Remover"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      <Dialog open={!!previewUrl} onOpenChange={(open) => !open && setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 overflow-hidden">
          <DialogHeader className="p-4 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-primary" />
              {previewName}
            </DialogTitle>
            <DialogDescription className="sr-only">Visualização de anexo</DialogDescription>
          </DialogHeader>
          
          <div className="flex-1 bg-muted/20 relative flex items-center justify-center overflow-hidden">
            {previewType?.includes("image") ? (
              <img 
                src={previewUrl!} 
                alt={previewName!} 
                className="max-w-full max-h-full object-contain shadow-lg shadow-black/20" 
              />
            ) : previewType === "application/pdf" ? (
              <iframe 
                src={`${previewUrl}#toolbar=0`} 
                className="w-full h-full border-0"
                title="Preview PDF"
              />
            ) : (
              <div className="text-center p-10">
                <AlertCircle className="w-12 h-12 text-warning mx-auto mb-4" />
                <p>Visualização não disponível para este tipo de arquivo.</p>
                <Button variant="link" onClick={() => window.open(previewUrl!, "_blank")}>
                  Tentar abrir em nova aba <ExternalLink className="w-4 h-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
          
          <DialogFooter className="p-4 border-t bg-muted/5">
            <Button variant="outline" onClick={() => setPreviewUrl(null)}>Fechar</Button>
            <a href={previewUrl!} download={previewName!} target="_blank" rel="noreferrer">
               <Button className="gap-2">
                 <Download className="w-4 h-4" /> Baixar Documento
               </Button>
            </a>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PatientAttachmentManager;
