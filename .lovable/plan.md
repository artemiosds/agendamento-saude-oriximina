# Plano: Dados unificados — Agendamento Online + Portal do Paciente

## Objetivo
Fazer o **Agendamento Online** (público) e a área "Meus Dados" do **Portal do Paciente** usarem a mesma estrutura de blocos do cadastro interno, com dados refletindo em tempo real na ficha do paciente.

## Blocos padronizados (idênticos aos do cadastro interno)
1. **Identificação** — Nome, Data Nasc., CPF, CNS, Sexo, Raça/Cor, Nacionalidade, Naturalidade/UF, Município, Nome da Mãe, Responsável (se menor)
2. **Endereço** — CEP, Tipo de Logradouro (DNE), Logradouro, Número, Complemento, Bairro, Município/UF
3. **Contato** — Telefone principal, Telefone secundário, E-mail
4. **Complementares** — Gestante, PNE, Autista (TEA), UBS de origem, Observações

Campos gravados nas colunas nativas de `pacientes` quando existirem (nome, cpf, cns, telefone, email, data_nascimento, endereco, is_gestante, is_pne, is_autista, naturalidade, naturalidade_uf, municipio, nome_mae, nome_responsavel, cpf_responsavel, ubs_origem, observacoes). Os demais (CEP, número, complemento, bairro, sexo, raça, nacionalidade, telefone secundário) vão para `pacientes.custom_data` — **sem criar novas colunas** (respeita a regra do projeto).

## Componente compartilhado
Criar `src/components/DadosPacienteBlocos.tsx` — versão **enxuta** dos blocos do `CadastroPacienteForm`, sem: fotos, anexos, encaminhamento clínico, campos SIGTAP/CID, histórico. Só os 4 blocos acima.

Reutilizado em:
- **`/agendar`** (etapa 2) — substitui os campos atuais, com senha do Portal ao final
- **`/portal` → aba "Meus Dados"** — nova aba com botão "Salvar alterações"

## Alterações por arquivo

### 1. `src/components/DadosPacienteBlocos.tsx` (novo)
- Props: `value`, `onChange`, `mode: "publico" | "portal"`, `showResponsavel`
- Usa `LogradouroDneAutocomplete` e `MunicipioCombobox` (já existentes)
- Sanitização e máscaras já testadas (CPF, CNS, CEP, telefone)

### 2. `src/pages/AgendarOnline.tsx`
- Etapa 2 troca campos avulsos por `<DadosPacienteBlocos mode="publico" />`
- Persistência: montar payload já com `custom_data` populado
- Sem quebra de fluxo (senha, validação, criação de conta continuam iguais)

### 3. `supabase/functions/public-scheduling/index.ts` (ação `create-patient`)
- Aceitar campos extras: `endereco`, `is_gestante`, `is_pne`, `is_autista`, `naturalidade`, `naturalidade_uf`, `municipio`, `nome_mae`, `nome_responsavel`, `cpf_responsavel`, `ubs_origem`, `custom_data`
- Adicionar ação `update-patient` (chamada pelo Portal, só permite atualizar o próprio registro via `auth.uid()` → `pacientes.auth_user_id`)

### 4. `src/pages/PortalPaciente.tsx`
- Nova aba **"Meus Dados"** no `Tabs` existente
- Formulário `<DadosPacienteBlocos mode="portal" />` pré-preenchido com `paciente`
- Botão "Salvar alterações" → chama edge function `public-scheduling?action=update-patient`
- Após salvar: `loadPacienteData` para refletir na UI

## Segurança (Supabase)
- **Não altera schema** — só usa colunas existentes + `custom_data` jsonb
- **RLS**: a atualização pelo Portal vai via edge function com **service role**, mas valida `auth.uid() === paciente.auth_user_id` antes de gravar (padrão já usado em `ensure-patient-portal`)
- **Nenhuma nova migração** necessária

## Riscos e mitigação
| Risco | Mitigação |
|---|---|
| Quebrar fluxo público existente | Manter `create-patient` retrocompatível (novos campos opcionais) |
| Paciente editando outro paciente | Edge function valida `auth_user_id === auth.uid()` antes de qualquer update |
| Sobrecarga de campos no formulário público | Blocos colapsáveis via `Accordion`; obrigatórios só em Identificação/Contato |
| Divergência de tipagem | `custom_data` como `Record<string, any>`, campos nativos tipados |

## Fora do escopo (não vou fazer)
- Foto do paciente
- Anexos / documentos
- Encaminhamento clínico, CID, mobilidade, equipamentos, dispositivos
- Bloco de "Histórico" clínico
- Novas colunas ou tabelas
- Alteração de campos de senha / recuperação (já funcionam)

## Ordem de execução
1. Criar `DadosPacienteBlocos.tsx`
2. Estender edge function `public-scheduling`
3. Trocar etapa 2 de `AgendarOnline.tsx`
4. Adicionar aba "Meus Dados" no `PortalPaciente.tsx`
5. Typecheck limpo

Aprovar para eu executar?
