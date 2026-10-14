# Diagnóstico (somente leitura) — CBO 251605 x SIGTAP 0301040079

Nenhum código, banco, configuração ou dado foi alterado. Nenhum registro pessoal foi consultado.

## Evidências
- Competência carregada: `loadBpaSigtapCatalog` (src/lib/bpaSigtapCatalog.ts) usa a competência pedida ou a mais recente anterior. A mais recente publicada é `TabelaUnificada_202609_v2610050950.zip`; atendimentos de 10/2026 usam 202609 como referência.
- `tb_procedimento.txt` 202609: 0301040079 "ESCUTA INICIAL / ORIENTAÇÃO (ACOLHIMENTO A DEMANDA ESPONTÂNEA)" está vigente.
- `rl_procedimento_registro.txt` 202609: instrumentos 01 (BPA-C) e 02 (BPA-I).
- `rl_procedimento_ocupacao.txt`: **zero linhas** para 0301040079 em 202607, 202608 e 202609 (nem 251605, nem outro CBO). Outros códigos aparecem normalmente (ex.: 0301010072 tem 69 linhas).
- Leitura das posições está correta: linhas com 22 caracteres + CRLF, procedimento 1-10, CBO 11-16, competência 17-22 (`line.slice(0,10)`, `slice(10,16)`, `slice(16,22)`).
- Regra que gera a crítica: `validarCompatibilidadeClinicaSigtap` em src/lib/sigtapClinicalValidation.ts, linha ~293: `if (!proc.cbos.has(cbo))`. Com a lista de CBOs vazia, qualquer CBO é recusado.

## Respostas
1. O SIGTAP 202609 não lista 251605 para 0301040079, mas também não lista nenhum CBO. Para esse código, a tabela não traz restrição de ocupação.
2. O carregamento e a leitura de `rl_procedimento_ocupacao.txt` estão corretos (posições, competência e normalização).
3. Causa provável: outro caminho de validação. O app entende "sem CBO relacionado" como "nenhum CBO permitido" e acusa incompatível. Não é falha de leitura do arquivo. O CBO do cadastro não é o motivo: mesmo com 251605, a crítica apareceria.
4. Arquivos e funções: `parseBpaSigtapCatalog` / `loadBpaSigtapCatalog` (bpaSigtapCatalog.ts) e `validarCompatibilidadeClinicaSigtap` (sigtapClinicalValidation.ts:293-297).

## Conclusão
**Falha confirmada na regra de validação.** O arquivo SIGTAP e a leitura estão certos. O erro está em tratar uma lista de CBOs vazia como proibição. Falta confirmar, na norma do DATASUS ou no SIA, se esse código sem ocupação relacionada é aceito no BPA-I sem crítica de CBO. Isso precisa ser confirmado antes de qualquer correção.

## Próximo passo sugerido (só com sua autorização)
Quando a lista de CBOs do procedimento estiver vazia, mostrar um aviso em vez de bloquear. A recusa continua valendo para quem tem CBO listado. Será criado um teste para 0301040079 com CBO 251605.
