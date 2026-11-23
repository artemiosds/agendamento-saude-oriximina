import { useState } from 'react';
import type { Sala } from '@/types';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

/** The choice confirms an actual location; a staff assignment alone never implies occupancy. */
export function AttendanceRoomDialog({ rooms, suggestedRoomId, busy, onCancel, onConfirm }: {
  rooms: Sala[]; suggestedRoomId?: string; busy: boolean; onCancel: () => void; onConfirm: (roomId: string) => void;
}) {
  const [roomId, setRoomId] = useState(rooms.some(r => r.id === suggestedRoomId) ? suggestedRoomId! : '');
  return <Dialog open onOpenChange={open => { if (!open && !busy) onCancel(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>Local do atendimento</DialogTitle>
        <DialogDescription>Confirme a sala que será utilizada para manter o painel da unidade atualizado.</DialogDescription>
      </DialogHeader>
      <Label htmlFor="attendance-room">Sala / consultório</Label>
      <select id="attendance-room" className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={roomId} disabled={busy} onChange={event => setRoomId(event.target.value)}>
        <option value="">Selecione o local</option>
        {rooms.map(room => <option key={room.id} value={room.id}>{room.nome}</option>)}
        <option value="__none__">Sem sala física definida</option>
      </select>
      {!rooms.length && <p className="text-sm text-muted-foreground">Não há salas ativas cadastradas nesta unidade.</p>}
      {roomId === '__none__' && <p className="text-sm text-muted-foreground">O atendimento ficará identificado como sem sala no Cockpit.</p>}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" disabled={busy} onClick={onCancel}>Cancelar</Button>
        <Button disabled={busy || !roomId} onClick={() => onConfirm(roomId === '__none__' ? '' : roomId)}>
          {busy ? 'Iniciando…' : 'Iniciar atendimento'}
        </Button>
      </div>
    </DialogContent>
  </Dialog>;
}
