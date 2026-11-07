import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { useLicense } from '@/hooks/useLicense';
import { useAuth } from '@/contexts/AuthContext';
import { LICENSE_MODULES, LicenseState } from '@/lib/licenseModules';

const ConfigLicencaModulos: React.FC = () => {
  const { license, save } = useLicense();
  const [draft, setDraft] = useState<LicenseState>(license);
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setDraft(license), [license]);

  const { user } = useAuth();
  const isOwner = user?.usuario === 'admin.sms';
  const changed = LICENSE_MODULES.some(m => draft[m.id] !== license[m.id]);

  if (!isOwner) {
    return (
      <Card><CardContent className="p-5">
        <p className="text-sm text-muted-foreground">Somente o administrador global do sistema pode gerenciar licenças e módulos.</p>
      </CardContent></Card>
    );
  }

  const handleSave = async () => {
    if (motivo.trim().length < 5) { toast.error('Informe o motivo da alteração.'); return; }
    setSaving(true);
    try { await save(draft, motivo.trim()); setMotivo(''); toast.success('Módulos atualizados.'); }
    catch (e: any) { toast.error('Não foi possível salvar: ' + (e?.message || 'erro')); }
    finally { setSaving(false); }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div>
          <h3 className="font-semibold text-lg">Licença e Módulos</h3>
          <p className="text-sm text-muted-foreground">
            Módulos desligados somem do menu e as páginas ficam indisponíveis. Nenhum dado é apagado: ao religar, tudo volta como estava.
          </p>
        </div>
        {LICENSE_MODULES.map(m => (
          <div key={m.id} className="flex items-center justify-between gap-4 border rounded-lg p-3">
            <div>
              <p className="font-medium">{m.label}</p>
              <p className="text-xs text-muted-foreground">{m.descricao}</p>
            </div>
            <Switch checked={draft[m.id]} onCheckedChange={v => setDraft(d => ({ ...d, [m.id]: v }))} />
          </div>
        ))}
        {changed && (
          <div className="space-y-2">
            <Textarea placeholder="Motivo da alteração (obrigatório)" value={motivo} onChange={e => setMotivo(e.target.value)} />
            <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar módulos'}</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ConfigLicencaModulos;
