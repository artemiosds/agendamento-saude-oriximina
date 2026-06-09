import React, { useState, useEffect, useRef, useMemo, useCallback, useDeferredValue } from "react";
import { cn, todayLocalStr } from "@/lib/utils";
import { ModalAgendarSessao } from "@/components/ModalAgendarSessao";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Skeleton } from "@/components/ui/skeleton";
import FichaPacienteCabecalho from "@/components/FichaPacienteCabecalho";
import { useProntuarioStructure } from "@/hooks/useProntuarioStructure";
import { useProntuarioConfig } from "@/hooks/useProntuarioConfig";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/contexts/PermissionsContext";
import { useData } from "@/contexts/DataContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DebouncedInput } from "@/components/ui/debounced-input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DebouncedTextarea } from "@/components/ui/debounced-textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, FileText, Printer, Pencil, Search, CheckCircle, History, Trash2, Activity, ClipboardList, Heart, AlertTriangle, Clock, ChevronDown, Settings, X, Tag, Pencil as PencilIcon, Eye, MoreVertical, Download, Link2, Send, FlaskConical, ChevronRight, Calendar, User, MapPin, Target, CalendarClock, Eraser, Home } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import HistoricoPacientePanel from "@/components/prontuario/HistoricoPacientePanel";
import HistoricoCentralList from "@/components/prontuario/HistoricoCentralList";
import { NovoProcedimentoModal } from "@/components/NovoProcedimentoModal";
import { procedureService } from "@/services/procedureService";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Progress } from "@/components/ui/progress";
import { useSearchParams, useNavigate } from "react-router-dom";
import AtendimentoTimer from "@/components/AtendimentoTimer";
import { openPrintDocument } from "@/lib/printLayout";
import { downloadProntuarioPdf } from "@/lib/prontuarioPdf";
import { Lock, FileDown } from "lucide-react";
import { HistoricoClinico } from "@/components/HistoricoClinico";
import { BuscaPaciente } from "@/components/BuscaPaciente";
import GerarDocumentoModal from "@/components/GerarDocumentoModal";
import DocumentosHistorico from "@/components/DocumentosHistorico";

import SolicitacaoExames from "@/components/SolicitacaoExames";
import PrescricaoMedicamentos from "@/components/PrescricaoMedicamentos";
import CamposEspecialidade from "@/components/CamposEspecialidade";
import HistoricoCompletoModal from "@/components/HistoricoCompletoModal";
import EncaminhamentoInternoModal from "@/components/EncaminhamentoInternoModal";
import SoapFieldsAdaptive from "@/components/SoapFieldsAdaptive";
import DynamicProntuarioFields from "@/components/prontuario/DynamicProntuarioFields";
import { isMedico, hasDropdownSoap } from "@/data/soapOptionsByProfession";
import { useSoapCustomOptions } from "@/hooks/useSoapCustomOptions";
import { Stamp } from "lucide-react";
import { getSoapValidationError, normalizeSoapPayload, treatmentService } from "@/services/treatmentService";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import VisitaDomiciliarProntuario from "@/components/visita-domiciliar/VisitaDomiciliarProntuario";

// ... (remaining of TIPOS_REGISTRO and emptyForm, etc)
