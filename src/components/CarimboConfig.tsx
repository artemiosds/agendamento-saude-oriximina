import React, { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Stamp, Upload, Loader2 } from 'lucide-react';

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
}

const CarimboConfig: React.FC = () => {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [carimbo, setCarimbo] = useState<CarimboRecord>({
    profissional_id: '',
    tipo: 'digital',
    nome: '',
    conselho: 'CREFITO',
    numero_registro: '',
    uf: 'PA',
    especialidade: '',
    cargo: '',
    imagem_url: '',
  });

  useEffect(() => {
    if (user?.id) loadCarimbo();
  }, [user?.id]);

  const loadCarimbo = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('profissionais_carimbo')
        .select('*')
        .eq('profissional_id', user!.id)
        .maybeSingle();
      if (data) {
        setCarimbo(data as unknown as CarimboRecord);
      } else {
        // Pre-fill from funcionarios
        setCarimbo(prev => ({
          ...prev,
          profissional_id: user!.id,
          nome: user!.nome || '',
        }));
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        profissional_id: user!.id,
        tipo: carimbo.tipo,
        nome: carimbo.nome,
        conselho: carimbo.conselho,
        numero_registro: carimbo.numero_registro,
        uf: carimbo.uf,
        especialidade: carimbo.especialidade,
        cargo: carimbo.cargo,
        imagem_url: carimbo.imagem_url,
      };

      if (carimbo.id) {
        await supabase
          .from('profissionais_carimbo')
          .update(payload)
          .eq('id', carimbo.id);
      } else {
        await supabase
          .from('profissionais_carimbo')
          .insert(payload);
      }
      toast.success('✅ Carimbo salvo com sucesso!');
      loadCarimbo();
    } catch (e: any) {
      toast.error('Erro ao salvar: ' + e.message);
    }
    setSaving(false);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Imagem deve ter no máximo 2MB');
      return;
    }
    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      toast.error('Apenas JPG ou PNG');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${user!.id}/carimbo.${ext}`;
      const { error } = await supabase.storage.from('carimbos').upload(path, file, { upsert: true });
      if (error) throw error;

      const { data: urlData } = supabase.storage.from('carimbos').getPublicUrl(path);
      setCarimbo(prev => ({ ...prev, imagem_url: urlData.publicUrl }));
      toast.success('Imagem enviada!');
    } catch (e: any) {
      toast.error('Erro no upload: ' + e.message);
    }
    setUploading(false);
  };

  const update = (field: keyof CarimboRecord, value: string) =>
    setCarimbo(prev => ({ ...prev, [field]: value }));

  if (loading) return <div className="flex items-center gap-2 p-4"><Loader2 className="animate-spin w-4 h-4" /> Carregando...</div>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Stamp className="w-5 h-5" /> Carimbo Profissional
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <RadioGroup
          value={carimbo.tipo}
          onValueChange={v => update('tipo', v)}
          className="flex gap-6"
        >
          <div className="flex items-center gap-2">
            <RadioGroupItem value="digital" id="tipo-digital" />
            <Label htmlFor="tipo-digital">Carimbo digital (gerado pelo sistema)</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="imagem" id="tipo-imagem" />
            <Label htmlFor="tipo-imagem">Imagem do carimbo físico</Label>
          </div>
        </RadioGroup>

        <Separator />

        {carimbo.tipo === 'digital' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Nome completo</Label>
              <Input value={carimbo.nome} onChange={e => update('nome', e.target.value)} placeholder="Dra. Patricia Ruanne Figueiredo" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Conselho</Label>
              <Input value={carimbo.conselho} onChange={e => update('conselho', e.target.value)} placeholder="CREFITO / CRM / CRP..." />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Número do registro</Label>
              <Input value={carimbo.numero_registro} onChange={e => update('numero_registro', e.target.value)} placeholder="12345-F" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">UF</Label>
              <Input value={carimbo.uf} onChange={e => update('uf', e.target.value)} placeholder="PA" maxLength={2} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Especialidade</Label>
              <Input value={carimbo.especialidade} onChange={e => update('especialidade', e.target.value)} placeholder="Fisioterapeuta" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Cargo / Função</Label>
              <Input value={carimbo.cargo} onChange={e => update('cargo', e.target.value)} placeholder="Coordenadora" />
            </div>

            {/* Digital preview */}
            <div className="col-span-full">
              <Label className="text-xs font-semibold mb-2 block">Preview do carimbo</Label>
              <div className="inline-block border border-foreground rounded-md px-5 py-3 text-center text-sm">
                <div className="font-bold">{carimbo.nome || 'Nome do Profissional'}</div>
                <div className="text-muted-foreground text-xs">{carimbo.conselho} / {carimbo.numero_registro}-{carimbo.uf}</div>
                <div className="text-muted-foreground text-xs">{carimbo.especialidade}</div>
                {carimbo.cargo && <div className="text-muted-foreground text-xs">{carimbo.cargo}</div>}
                <div className="text-muted-foreground text-[10px]">CER II — Oriximiná/PA</div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Upload da imagem do carimbo (JPG/PNG, máx 2MB)</Label>
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" className="gap-1.5" asChild disabled={uploading}>
                  <label className="cursor-pointer">
                    {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                    {uploading ? 'Enviando...' : 'Selecionar imagem'}
                    <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleImageUpload} />
                  </label>
                </Button>
              </div>
            </div>
            {carimbo.imagem_url && (
              <div>
                <Label className="text-xs font-semibold mb-2 block">Preview</Label>
                <img src={carimbo.imagem_url} alt="Carimbo" className="max-w-[250px] max-h-[120px] border rounded" />
              </div>
            )}
          </div>
        )}

        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Stamp className="w-4 h-4" />}
          Salvar Carimbo
        </Button>
      </CardContent>
    </Card>
  );
};

export default CarimboConfig;
