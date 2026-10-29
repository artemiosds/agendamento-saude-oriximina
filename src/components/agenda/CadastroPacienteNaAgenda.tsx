import { useRef, useState } from 'react';
import CadastroPacienteForm, { emptyPacienteForm, type PacienteFormData } from '@/components/CadastroPacienteForm';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { patientService } from '@/services/patientService';
import { validatePacienteCadastro } from '@/lib/pacienteCadastro';
import { firstPacienteError } from '@/lib/pacienteFormFields';
import { toast } from 'sonner';

export default function CadastroPacienteNaAgenda({ termo, unidadeId, onSaved, onCancel, onBusyChange }: {
 termo: string; unidadeId: string; onSaved: (row: Record<string,any>) => void; onCancel: () => void; onBusyChange: (busy:boolean) => void;
}) {
 const {user}=useAuth();
 const [form,setForm]=useState<PacienteFormData>(()=>{
   const digits=termo.replace(/\D/g,''); const numeric=/^[\d.\-\s]+$/.test(termo);
   return {...emptyPacienteForm,customData:{...emptyPacienteForm.customData},equipamentos:[],patientProcedures:[],
     nome:numeric && [11,15].includes(digits.length) ? '' : termo.toUpperCase(),
     cpf:numeric && digits.length===11 ? digits : '',cns:numeric && digits.length===15 ? digits : ''};
 });
 const [errors,setErrors]=useState<Record<string,string>>({});
 const [message,setMessage]=useState('');const [saving,setSaving]=useState(false);
 const lock=useRef(false);const [requestId]=useState(()=>`p${crypto.randomUUID()}`);
 const save=async()=>{
   if(lock.current)return;
   const validation=validatePacienteCadastro(form);setErrors(validation);setMessage('');
   if(Object.keys(validation).length){setMessage(firstPacienteError(validation)!.message);return;}
   if(!user){setMessage('Sua sessão expirou. Entre novamente antes de cadastrar.');return;}
   lock.current=true;setSaving(true);onBusyChange(true);
   try {
     const row=await patientService.createPaciente(form,user,unidadeId,requestId);
     onSaved(row);toast.success('Paciente cadastrado e selecionado com sucesso!');
   }catch(error:any){setErrors(error.fieldErrors || {});setMessage(error.message || 'Não foi possível cadastrar. Seus dados foram mantidos; tente novamente.');}
   finally{lock.current=false;setSaving(false);onBusyChange(false);}
 };
 return <div className="space-y-3">
   <Button type="button" variant="outline" disabled={saving} onClick={onCancel}>← Voltar para o Agendamento</Button>
   {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
   <fieldset disabled={saving} className="min-w-0"><CadastroPacienteForm form={form} onChange={setForm} onSave={save} saving={saving} isEdit={false} errors={errors} administrativeOnly /></fieldset>
 </div>;
}
