import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Stamp, Upload, Loader2, PenLine } from 'lucide-react';

interface CarimboCustomData {
  cbo?: string;
  cns_profissional?: string;
  cidade_uf?: string;
  texto_complementar?: string;
  assinatura_url?: string;
  posicao?: 'left' | 'center' | 'right';
  mostrar_linha?: boolean;
  mostrar_nome?: boolean;
  mostrar_conselho?: boolean;
  mostrar_data_local?: boolean;
}

interface CarimboRecord {
  id?: string;
  profissional_id: string;
  tipo: 'digital' | 'imagem';
  nome: string;
  conselho: string;
  numero_registro: string;
  uf: string;
  especialidade: string;
  cargo: string;
  imagem_url: string;
  custom_data: CarimboCustomData;
}

const DEFAULT_CD: CarimboCustomData = {
  cbo: '', cns_profissional: '', cidade_uf: 'Oriximiná/PA', texto_complementar: '',
  assinatura_url: '', posicao: 'center',
  mostrar_linha: true, mostrar_nome: true, mostrar_conselho: true, mostrar_data_local: false,
};

const CarimboConfig: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<'carimbo' | 'assinatura' | null>(null);
  const [carimbo, setCarimbo] = useState<CarimboRecord>({
    profissional_id: '', tipo: 'digital', nome: '', conselho: 'CREFITO',
    numero_registro: '', uf: 'PA', especialidade: '', cargo: '', imagem_url: '',
    custom_data: { ...DEFAULT_CD },
  });

  useEffect(() => { if (user?.id) loadCarimbo(); }, [user?.id]);

  const loadCarimbo = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('profissionais_carimbo').select('*').eq('profissional_id', user!.id).maybeSingle();
      if (data) {
        const rec = data as any;
        setCarimbo({ ...rec, custom_data: { ...DEFAULT_CD, ...(rec.custom_data || {}) } });
      } else {
        setCarimbo(prev => ({ ...prev, profissional_id: user!.id, nome: user!.nome || '' }));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        profissional_id: user!.id, tipo: carimbo.tipo, nome: carimbo.nome,
        conselho: carimbo.conselho, numero_registro: carimbo.numero_registro, uf: carimbo.uf,
        especialidade: carimbo.especialidade, cargo: carimbo.cargo, imagem_url: carimbo.imagem_url,
        custom_data: carimbo.custom_data,
      };
      if (carimbo.id) {
        await supabase.from('profissionais_carimbo').update(payload).eq('id', carimbo.id);
      } else {
        await supabase.from('profissionais_carimbo').insert(payload);
      }
      toast.success('✅ Carimbo salvo com sucesso!');
      loadCarimbo();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, kind: 'carimbo' | 'assinatura') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('Imagem deve ter no máximo 2MB'); return; }
    if (!['image/jpeg', 'image/png'].includes(file.type)) { toast.error('Apenas JPG ou PNG'); return; }
    setUploading(kind);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user!.id}/${kind}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('carimbos').upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from('carimbos').getPublicUrl(path);
      if (kind === 'carimbo') setCarimbo(prev => ({ ...prev, imagem_url: urlData.publicUrl }));
      else setCarimbo(prev => ({ ...prev, custom_data: { ...prev.custom_data, assinatura_url: urlData.publicUrl } }));
      toast.success('Imagem enviada!');
    } catch (e: any) {
      toast.error('Erro no upload: ' + e.message);
    }
    setUploading(null);
  };

  const update = (field: keyof CarimboRecord, value: any) => setCarimbo(prev => ({ ...prev, [field]: value }));
  const updateCD = (field: keyof CarimboCustomData, value: any) => setCarimbo(prev => ({ ...prev, custom_data: { ...prev.custom_data, [field]: value } }));

  if (loading) return <div className="flex items-center gap-2 p-4"><Loader2 className="animate-spin w-4 h-4" /> Carregando...</div>;

  const cd = carimbo.custom_data;
  const conselhoStr = [carimbo.conselho, carimbo.numero_registro].filter(Boolean).join(' ') + (carimbo.uf ? `/${carimbo.uf}` : '');

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stamp className="w-5 h-5" /> Carimbo e Assinatura Profissional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <RadioGroup value={carimbo.tipo} onValueChange={v => update('tipo', v)} className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2"><RadioGroupItem value="digital" id="tipo-digital" /><Label htmlFor="tipo-digital">Carimbo digital (gerado pelo sistema)</Label></div>
          <div className="flex items-center gap-2"><RadioGroupItem value="imagem" id="tipo-imagem" /><Label htmlFor="tipo-imagem">Imagem do carimbo físico</Label></div>
        </RadioGroup>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Nome completo</Label><Input value={carimbo.nome} onChange={e => update('nome', e.target.value)} placeholder="Dra. Patricia Ruanne Figueiredo" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Cargo / Função</Label><Input value={carimbo.cargo} onChange={e => update('cargo', e.target.value)} placeholder="Coordenadora" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Especialidade</Label><Input value={carimbo.especialidade} onChange={e => update('especialidade', e.target.value)} placeholder="Fisioterapeuta" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Conselho</Label><Input value={carimbo.conselho} onChange={e => update('conselho', e.target.value)} placeholder="CREFITO / CRM / CRP..." /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Número do registro</Label><Input value={carimbo.numero_registro} onChange={e => update('numero_registro', e.target.value)} placeholder="12345-F" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">UF do conselho</Label><Input value={carimbo.uf} onChange={e => update('uf', e.target.value)} placeholder="PA" maxLength={2} /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">CBO</Label><Input value={cd.cbo || ''} onChange={e => updateCD('cbo', e.target.value)} placeholder="223605" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">CNS profissional (opcional)</Label><Input value={cd.cns_profissional || ''} onChange={e => updateCD('cns_profissional', e.target.value)} placeholder="000 0000 0000 0000" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Cidade/UF</Label><Input value={cd.cidade_uf || ''} onChange={e => updateCD('cidade_uf', e.target.value)} placeholder="Oriximiná/PA" /></div>
          <div className="space-y-1.5"><Label className="text-xs font-semibold">Posição no documento</Label>
            <Select value={cd.posicao || 'center'} onValueChange={v => updateCD('posicao', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Esquerda</SelectItem>
                <SelectItem value="center">Centro</SelectItem>
                <SelectItem value="right">Direita</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="md:col-span-2 space-y-1.5"><Label className="text-xs font-semibold">Texto complementar</Label><Input value={cd.texto_complementar || ''} onChange={e => updateCD('texto_complementar', e.target.value)} placeholder="Ex.: Coordenação CER II — SMS Oriximiná" /></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { key: 'mostrar_linha', label: 'Linha de assinatura' },
            { key: 'mostrar_nome', label: 'Nome' },
            { key: 'mostrar_conselho', label: 'Conselho' },
            { key: 'mostrar_data_local', label: 'Data e local' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-2 bg-muted/40 rounded-lg gap-2">
              <span className="text-xs">{item.label}</span>
              <Switch checked={(cd as any)[item.key] !== false} onCheckedChange={v => updateCD(item.key as any, v)} />
            </div>
          ))}
        </div>

        <Separator />

        {/* Uploads */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1.5"><PenLine className="w-3.5 h-3.5" /> Imagem da assinatura (opcional)</Label>
            <div className="border rounded-lg p-3 bg-muted/30 flex flex-col items-center gap-2 min-h-[120px] justify-center">
              {cd.assinatura_url
                ? <img src={cd.assinatura_url} alt="Assinatura" className="max-h-16 max-w-[180px] object-contain" />
                : <div className="text-[11px] text-muted-foreground">Sem imagem</div>}
              <Button variant="outline" size="sm" className="gap-1.5" asChild disabled={uploading === 'assinatura'}>
                <label className="cursor-pointer">
                  {uploading === 'assinatura' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Selecionar
                  <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={e => handleImageUpload(e, 'assinatura')} />
                </label>
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-1.5"><Stamp className="w-3.5 h-3.5" /> Imagem do carimbo físico (opcional)</Label>
            <div className="border rounded-lg p-3 bg-muted/30 flex flex-col items-center gap-2 min-h-[120px] justify-center">
              {carimbo.imagem_url
                ? <img src={carimbo.imagem_url} alt="Carimbo" className="max-h-20 max-w-[200px] object-contain" />
                : <div className="text-[11px] text-muted-foreground">Sem imagem</div>}
              <Button variant="outline" size="sm" className="gap-1.5" asChild disabled={uploading === 'carimbo'}>
                <label className="cursor-pointer">
                  {uploading === 'carimbo' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                  Selecionar
                  <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={e => handleImageUpload(e, 'carimbo')} />
                </label>
              </Button>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <Label className="text-xs font-semibold mb-2 block">Preview no documento</Label>
          <div className="bg-white border rounded-lg p-6">
            <div style={{ textAlign: cd.posicao === 'left' ? 'left' : cd.posicao === 'right' ? 'right' : 'center' }}>
              {cd.mostrar_data_local && <div className="text-xs text-muted-foreground mb-6">{cd.cidade_uf}, {new Date().toLocaleDateString('pt-BR')}</div>}
              {cd.assinatura_url && <img src={cd.assinatura_url} alt="" className="max-h-14 mb-1 inline-block" style={{ display: cd.posicao === 'center' ? 'inline-block' : 'block' }} />}
              {cd.mostrar_linha && <div className="border-t border-foreground/70 mx-auto my-1" style={{ width: 280, marginLeft: cd.posicao === 'left' ? 0 : cd.posicao === 'right' ? 'auto' : 'auto', marginRight: cd.posicao === 'right' ? 0 : 'auto' }} />}
              {cd.mostrar_nome && carimbo.nome && <div className="font-bold text-sm uppercase tracking-wide">{carimbo.nome}</div>}
              {carimbo.especialidade && <div className="text-xs text-muted-foreground">{carimbo.especialidade}{carimbo.cargo && ' — ' + carimbo.cargo}</div>}
              {cd.mostrar_conselho && conselhoStr.trim() && <div className="text-xs text-muted-foreground">{conselhoStr}</div>}
              {cd.cbo && <div className="text-xs text-muted-foreground">CBO: {cd.cbo}</div>}
              {cd.cns_profissional && <div className="text-xs text-muted-foreground">CNS: {cd.cns_profissional}</div>}
              {cd.texto_complementar && <div className="text-[11px] text-muted-foreground">{cd.texto_complementar}</div>}
              {carimbo.tipo === 'imagem' && carimbo.imagem_url && <img src={carimbo.imagem_url} alt="" className="max-h-20 mt-2 inline-block" />}
            </div>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
          Salvar Carimbo
        </Button>
      </CardContent>
    </Card>
  );
};

export default CarimboConfig;
