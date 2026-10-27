import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const f=vi.hoisted(()=>({ user: { id:'r1',nome:'RECEPÇÃO',role:'recepcao',usuario:'r1',unidadeId:'u1' },
  appointments: [] as any[], queue: [] as any[], server: [] as any[], query:vi.fn(),rpc:vi.fn(),apply:vi.fn(),refresh:vi.fn(),toast:vi.fn() }));
vi.mock('@/contexts/AuthContext',()=>({useAuth:()=>({user:f.user})}));
vi.mock('@/contexts/AgendamentosContext',()=>({useAgendamentos:()=>({agendamentos:f.appointments,applyCareFlowAgendamentoUpdate:f.apply})}));
vi.mock('@/contexts/FilaContext',()=>({useFila:()=>({fila:f.queue,refreshFila:f.refresh})}));
vi.mock('@/lib/utils',async original=>({...await original<typeof import('@/lib/utils')>(),todayLocalStr:()=> '2026-10-23', nowTimeBrazilStr:()=> '08:00:00'}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{from:(table:string)=>{let unit='';const q:any={select:()=>q,in:()=>q,order:()=>q,range:()=>q,eq:(key:string,value:string)=>{if(key==='unidade_id')unit=value;return q;},then:(resolve:any)=>{
 if(table==='fila_espera')f.query();
 const data=table==='agendamentos'?f.appointments.filter(a=>a.data==='2026-10-23' && (!unit || a.unidadeId===unit)).map(a=>({id:a.id,paciente_id:a.pacienteId,paciente_nome:a.pacienteNome,profissional_nome:a.profissionalNome,unidade_id:a.unidadeId,hora:a.hora})):f.server;
 return Promise.resolve({data,error:null}).then(resolve);}};return q;},rpc:(...args:any[])=>f.rpc(...args)}}));
vi.mock('sonner',()=>({toast:{success:f.toast,error:f.toast}}));
import TriageReconciliationPanel from './TriageReconciliationPanel';
beforeEach(()=>{
 vi.clearAllMocks();f.user.role='recepcao'; f.user.unidadeId='u1';f.user.usuario='r1'; f.queue=[];f.server=[];
 f.appointments=[{id:'ag1',data:'2026-10-23',status:'confirmado_chegada',pacienteId:'p1',unidadeId:'u1',pacienteNome:'PACIENTE',profissionalNome:'PROFISSIONAL',hora:'08:00'}];
 f.rpc.mockResolvedValue({data:{already_processed:false,reconciled:true,status:'confirmado_chegada',agendamento:{id:'ag1'},fila:{id:'ag1'}},error:null});f.refresh.mockResolvedValue(undefined);
});
afterEach(cleanup);
describe('sincronização manual de chegadas',()=>{
 it('consulta a fila sem gravar e só sincroniza ao clicar',async()=>{
  render(<TriageReconciliationPanel/>);const button=await screen.findByRole('button',{name:'Sincronizar com a Triagem'});
  expect(f.rpc).not.toHaveBeenCalled();fireEvent.click(button);
  await waitFor(()=>expect(f.rpc).toHaveBeenCalledWith('confirmar_chegada_atendimento',expect.objectContaining({p_agendamento_id:'ag1',p_unidade_id:'u1',p_reconciliar:true,p_paciente_id_esperado:'p1'})));
  await waitFor(()=>expect(screen.queryByRole('region')).not.toBeInTheDocument());
 });
 it.each(['profissional','triagem'])('não oferece correção ao perfil %s',async role=>{
  f.user.role=role;render(<TriageReconciliationPanel/>);expect(f.query).not.toHaveBeenCalled();expect(screen.queryByRole('region')).not.toBeInTheDocument();
 });
 it('não consulta filas nem oferece correção para ontem ou outra unidade',async()=>{
  f.appointments=[{...f.appointments[0],data:'2026-10-22'},{...f.appointments[0],id:'ag2',unidadeId:'u2'}];render(<TriageReconciliationPanel/>);await waitFor(()=>expect(screen.queryByRole('region')).not.toBeInTheDocument());expect(f.query).not.toHaveBeenCalled();
 });
 it('não oferece correção quando a fila já está ativa no banco',async()=>{
  f.server=[{id:'ag1',status:'aguardando_triagem'}];render(<TriageReconciliationPanel/>);
  await waitFor(()=>expect(f.query).toHaveBeenCalled());expect(screen.queryByRole('button')).not.toBeInTheDocument();
 });
 it('reconfere periodicamente e libera o timer ao desmontar',async()=>{
  vi.useFakeTimers();
  try {
   const {unmount}=render(<TriageReconciliationPanel/>);
   await act(async()=>{await vi.advanceTimersByTimeAsync(0);});
   expect(screen.getByRole('region')).toBeInTheDocument();
   f.server=[{id:'ag1',status:'apto_atendimento'}];
   await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
   expect(screen.queryByRole('region')).not.toBeInTheDocument();
   expect(f.rpc).not.toHaveBeenCalled();
   unmount();expect(vi.getTimerCount()).toBe(0);
  } finally {cleanup();vi.useRealTimers();}
 });
 it('remove aviso resolvido em outro terminal ao retornar à janela',async()=>{
  render(<TriageReconciliationPanel/>);
  await screen.findByRole('button',{name:'Sincronizar com a Triagem'});
  f.server=[{id:'ag1',status:'apto_atendimento'}];
  fireEvent(window,new Event('focus'));
  await waitFor(()=>expect(screen.queryByRole('region')).not.toBeInTheDocument());
  expect(f.rpc).not.toHaveBeenCalled();
 });
 it('revalida mudança de status mesmo quando os IDs da agenda não mudam',async()=>{
  const {rerender}=render(<TriageReconciliationPanel/>);
  await screen.findByRole('button',{name:'Sincronizar com a Triagem'});
  f.server=[{id:'ag1',status:'apto_atendimento'}];
  f.appointments=[{...f.appointments[0],status:'aguardando_triagem'}];
  rerender(<TriageReconciliationPanel/>);
  await waitFor(()=>expect(screen.queryByRole('region')).not.toBeInTheDocument());
 });
 it('exclusão explícita da fila exige ação manual para ser revertida',async()=>{
  f.server=[{id:'ag1',status:'excluido_da_fila_triagem'}];render(<TriageReconciliationPanel/>);
  await screen.findByRole('button',{name:'Sincronizar com a Triagem'});expect(f.rpc).not.toHaveBeenCalled();
 });
});
