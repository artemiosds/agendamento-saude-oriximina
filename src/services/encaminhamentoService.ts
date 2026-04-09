import { supabase } from '@/integrations/supabase/client';

export interface EncaminhamentoData {
  id: string;
  paciente_id: string;
  paciente_nome: string;
  paciente_cpf: string;
  paciente_cns: string;
  paciente_data_nascimento: string;
  paciente_cid: string;
  paciente_especialidade_destino: string;
  profissional_origem_id: string;
  profissional_origem_nome: string;
  profissional_origem_profissao: string;
  profissional_origem_conselho: string;
  profissional_destino_id: string;
  especialidade_destino: string;
  conteudo_documento: string;
  observacao: string;
  status: 'recebido' | 'lido';
  data_geracao: string;
  data_leitura?: string;
  gerado_por: string;
  gerado_por_perfil: string;
  unidade: string;
  tipo_documento: string;
}

function generateId(): string {
  // Simple UUID v4 without external dep
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function salvarEncaminhamento(data: Omit<EncaminhamentoData, 'id' | 'status' | 'data_geracao'>): Promise<{ success: boolean; error?: string }> {
  try {
    const id = generateId();
    const now = new Date().toISOString();
    const record: EncaminhamentoData = {
      ...data,
      id,
      status: 'recebido',
      data_geracao: now,
    };

    const blob = new Blob([JSON.stringify(record, null, 2)], { type: 'application/json' });
    const path = `${data.profissional_destino_id}/${id}.json`;

    const { error } = await supabase.storage
      .from('encaminhamentos')
      .upload(path, blob, { contentType: 'application/json', upsert: false });

    if (error) throw error;
    return { success: true };
  } catch (err: any) {
    console.error('Erro ao salvar encaminhamento:', err);
    return { success: false, error: err.message || 'Erro desconhecido' };
  }
}

export async function listarEncaminhamentos(profissionalId?: string): Promise<EncaminhamentoData[]> {
  try {
    // List files in the bucket
    const folder = profissionalId || '';
    
    if (profissionalId) {
      // Professional: list their own folder
      return await listarPasta(profissionalId);
    } else {
      // Master/Gestão: list all folders
      const { data: folders, error } = await supabase.storage
        .from('encaminhamentos')
        .list('', { limit: 1000 });
      
      if (error) throw error;
      
      const allRecords: EncaminhamentoData[] = [];
      for (const folder of (folders || [])) {
        if (folder.id) {
          // it's a file at root, skip
          continue;
        }
        const records = await listarPasta(folder.name);
        allRecords.push(...records);
      }
      return allRecords;
    }
  } catch (err) {
    console.error('Erro ao listar encaminhamentos:', err);
    return [];
  }
}

async function listarPasta(folder: string): Promise<EncaminhamentoData[]> {
  const { data: files, error } = await supabase.storage
    .from('encaminhamentos')
    .list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });

  if (error || !files) return [];

  const records: EncaminhamentoData[] = [];
  for (const file of files) {
    if (!file.name.endsWith('.json')) continue;
    try {
      const { data } = await supabase.storage
        .from('encaminhamentos')
        .download(`${folder}/${file.name}`);
      if (data) {
        const text = await data.text();
        records.push(JSON.parse(text));
      }
    } catch (_) {
      // skip corrupted files
    }
  }
  return records;
}

export async function marcarComoLido(encaminhamento: EncaminhamentoData): Promise<boolean> {
  try {
    const updated: EncaminhamentoData = {
      ...encaminhamento,
      status: 'lido',
      data_leitura: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(updated, null, 2)], { type: 'application/json' });
    const path = `${encaminhamento.profissional_destino_id}/${encaminhamento.id}.json`;

    const { error } = await supabase.storage
      .from('encaminhamentos')
      .update(path, blob, { contentType: 'application/json', upsert: true });

    if (error) throw error;
    return true;
  } catch (err) {
    console.error('Erro ao marcar como lido:', err);
    return false;
  }
}
