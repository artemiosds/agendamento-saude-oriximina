# Correção localizada da serialização TXT BPA-I

## Diagnóstico confirmado

- A conferência/PDF e o TXT não consomem um único registro final. Em `BpaExportar.tsx`, o TXT recebe um objeto em `buildRegistro03()`, enquanto o PDF recebe outro objeto (`rowConf`) montado separadamente.
- O CNS do PDF usa `cns_pac_raw`; o TXT usa `cns_pac`. Quando `pickValidCnsPaciente()` rejeita o valor, `cns_pac` recebe explicitamente `000000000000000`, enquanto o PDF continua mostrando o valor original. Essa é a causa confirmada da divergência de Agatha.
- O CNS `706030670706037` existe no campo principal do cadastro de Agatha, mas a validação mod-11 atual o rejeita. Esta correção não alterará cadastro nem regras de coleta; eliminará o fallback silencioso e fará PDF/TXT derivarem do mesmo registro final.
- DNE e endereço são resolvidos antes do TXT por `normalizeBpaAddress()` usando `logradouros_dne`, mas depois são copiados separadamente para o TXT e para `rowConf`. Essa duplicação permite divergência entre conferência e serialização.
- O código DNE vazio não gera hoje um erro do construtor fixed-width: `required: true` está declarado no layout, mas não é validado. Assim, campos obrigatórios podem chegar vazios à linha sem bloquear o arquivo.
- A serialização só valida o comprimento total de 338 posições; ela não relê CNS, DNE, logradouro, número ou bairro para comparar com o objeto que originou a linha.
- Os dados reais confirmam:
  - Alerrando possui `tipoLogradouroCodigo=100`, `tipoLogradouroDne=Travessa`, logradouro `LUIZ INACIO LULA DA SILVA`, número `1261` e bairro `PENTA` em dados estruturados.
  - Ana Luisa possui código `100`, logradouro `DA CONQUISTA`, número `632` e bairro `PENTA`; esse caso deve permanecer inalterado.
  - Andria possui somente o endereço livre `Travessa Jonatas Atias, 271, Santa Luzia`; os campos estruturados de logradouro, número e bairro estão vazios. Portanto, o serializer não deve inventar a separação. Ele preservará o dado disponível e sinalizará a ausência dos campos estruturados; o teste de separação será feito com uma entrada realmente estruturada.
- O catálogo real confirma `TRAVESSA=100`, `RUA=081`, `PASSAGEM=074` e `RESIDENCIAL=487`.
- As posições 66–79 do cabeçalho recebem o documento CNPJ/CPF do órgão de origem, não o CNES. A unidade atual possui CNES, mas não possui CNPJ/CPF em seus dados disponíveis. Nenhum documento será inventado ou substituído pelo CNES.

## Implementação mínima

### 1. Criar um registro final único por linha

Criar um tipo/objeto `BpaRegistroFinal` imediatamente antes da serialização, contendo exatamente os campos já resolvidos no fluxo atual: CNS do paciente, nascimento, sexo, município, endereço estruturado/DNE, atendimento, SIGTAP, CBO, CNS profissional, CNES, CID, quantidade e demais campos do Registro 03.

- Não alterar coleta, consolidação, filtros, SIGTAP, procedimentos padrão ou contagens.
- Não consultar novas fontes nem modificar o banco.
- `buildRegistro03()` receberá esse objeto final.
- `rowConf` do PDF/Excel será projetado desse mesmo objeto final, eliminando a montagem paralela.
- Depois de montado, o registro final será tratado como semanticamente imutável: a serialização não fará novas consultas nem recalculará CNS, endereço, DNE ou SIGTAP.
- A solução será geral; os pacientes citados serão apenas casos de regressão, sem condicionais por nome, CNS, endereço ou competência.

### 2. Corrigir o tratamento do CNS somente na saída final

- Remover o fallback silencioso `000000000000000` do caminho de emissão.
- O registro final usará uma única resolução de CNS, compartilhada por conferência e TXT.
- Um CNS presente no registro final será serializado sem troca por zeros.
- Antes de decidir sobre um CNS rejeitado, conferir o algoritmo atual contra as regras oficiais aplicáveis aos CNS iniciados por 1/2 e 7/8/9. Uma divergência do validador será corrigida na função comum, não por exceção de paciente.
- Se o registro final estiver realmente sem CNS após todas as fontes legítimas, registrar paciente, data, procedimento, motivo técnico e regra impeditiva. O atendimento não desaparecerá silenciosamente; somente a linha impossível de representar será bloqueada.
- Não alterar o cadastro nem inventar CNS.
- Como o CNS de Agatha é rejeitado pelo algoritmo atual apesar de existir no cadastro e na conferência, o algoritmo será primeiro verificado. O teste real exigirá que o CNS resolvido para o registro final seja idêntico no PDF e no TXT, nunca zeros.

### 3. Preservar endereço estruturado e DNE

- Reutilizar exclusivamente `normalizeBpaAddress()` e o catálogo real `logradouros_dne` já carregado.
- Incluir no registro final o tipo textual, código DNE, logradouro, número, complemento e bairro já resolvidos.
- O serializer apenas sanitizará, limitará e preencherá posições; não reconstruirá endereço livre.
- Quando houver código/tipo estruturado válido, como Alerrando, o TXT deverá manter `100`.
- Quando só existir endereço livre, como Andria, preservar o texto disponível e gerar alerta; não deslocar/adivinhar número ou bairro.
- Preservar integralmente os casos já corretos de Ana Luisa, `35B`, `SN` e `S/N`.
- Uma falha corrigível de mapeamento ou serialização não removerá procedimento válido nem atendimento realizado.

### 4. Adicionar auditoria pós-serialização

Criar uma função pura que leia a linha pelas posições de `BPA_I_FIELDS` e compare os campos serializados com o mesmo `BpaRegistroFinal`.

Comparar pelo menos:

- CNS paciente;
- procedimento e CID;
- município IBGE;
- código DNE;
- logradouro;
- número;
- bairro;
- data do atendimento;
- CBO, CNS profissional e CNES.

A comparação considerará a sanitização e o corte oficial do campo. Qualquer alteração semântica, zeros indevidos ou deslocamento bloqueará o download pelo mecanismo de erro estrutural já existente, sem mudar a tela de validação.

Cada erro pós-serialização identificará paciente, data do atendimento, procedimento, campo, posições inicial/final, valor esperado, valor encontrado e regra que impediu a correção automática.

### 5. Validar o documento do cabeçalho sem inventar dados

- Manter as posições 66–79 como CNPJ/CPF do órgão de origem.
- Não usar CNES como substituto.
- Não hardcodar CNPJ/CPF.
- Confirmar na especificação de layout adotada pelo projeto se o campo é obrigatório ou pode ficar em branco antes de mudar seu comportamento.
- A unidade atual não apresenta CNPJ/CPF nos dados consultados. Se a obrigatoriedade for confirmada, expor a causa e bloquear explicitamente; se o layout admitir branco, preservar branco. Em nenhum caso produzir zeros silenciosos ou usar CNES.
- Preservar cabeçalho de 130 posições, total de registros, folhas e campo de controle.

## Testes

Adicionar testes unitários focados na fronteira `registro final → linha fixed-width → leitura por posições`:

1. Agatha: CNS `706030670706037` permanece idêntico no campo 60–74 e nunca vira zeros.
2. CNS realmente ausente: erro bloqueante, sem fallback zerado.
3. Alerrando: `TRAVESSA` pelo catálogo produz código `100` no campo 200–202.
4. Andria estruturada em fixture: logradouro, `271` e `SANTA LUZIA` permanecem em campos separados; o caso real sem estrutura não será adivinhado.
5. Ana Luisa: `100`, `DA CONQUISTA`, `632` e `PENTA` permanecem corretos.
6. Número `35B`, `SN` e `S/N` permanecem válidos.
7. Divergência objeto × linha é detectada e bloqueia o download.
8. Cada Registro 03 mantém 338 caracteres.
9. Cabeçalho mantém 130 caracteres e documento de origem ausente não vira zeros/CNES.
10. Quantidade de linhas, folhas e campo de controle continuam correspondendo aos procedimentos válidos.
11. Reexecutar toda a suíte BPA-I para proteger múltiplos procedimentos, competência, idade, CBO, CID, município e deduplicação.
12. Caso real de Andria com estrutura incompleta: preservar o texto disponível, sem inventar número ou bairro.

## Validação prática

- Gerar novamente a competência `202608` pelo mesmo fluxo real de produção, sem modificar dados, usando exatamente os filtros/opções do cenário que apresentou 245 atendimentos, 1.225 procedimentos consolidados, 1.223 válidos, 1.223 Registros 03, 2 rejeitados e 0 eliminações finais.
- Gerar a conferência/PDF a partir do mesmo conjunto e comparar automaticamente os 1.223 registros válidos, salvo impossibilidade real individualmente demonstrada.
- Comparar os registros finais usados pela conferência com os campos relidos do TXT: quantidade, paciente, CNS, atendimento, procedimento, DNE, logradouro, número, bairro, CID, município e quantidade.
- Conferir especificamente Agatha, Alerrando, Andria e Ana Luisa.
- Comprovar que nenhum atendimento válido foi perdido por erro de serialização, nenhum CNS existente virou `000000000000000`, nenhum DNE já resolvido desapareceu e nenhum endereço estruturado teve logradouro, número ou bairro deslocado.
- Confirmar: cabeçalho 130; todas as linhas 338; total de registros, folhas e campo de controle fechando; nenhum código DNE fora de `logradouros_dne`.
- Listar qualquer registro ainda impossível de emitir com paciente, data, procedimento, motivo técnico exato e regra impeditiva.
- A correção somente será considerada concluída após essa prova prática; testes unitários, verificação de tipos e build isoladamente não serão suficientes.
- Executar testes, verificação de tipos, build e inspeção do download no navegador.

## Arquivos previstos

- `src/lib/bpaTxtLayout.ts`: leitura/auditoria posicional e validação obrigatória localizada.
- Novo teste unitário da auditoria pós-serialização, ou extensão pontual de `src/lib/bpaTxtLayout.test.ts`.
- `src/pages/painel/BpaExportar.tsx`: criar o registro final comum e fazê-lo alimentar TXT e conferência/PDF.
- `src/lib/bpaAddressNormalization.test.ts`: somente os casos adicionais de preservação estruturada/DNE, se necessário.

Nenhuma tabela, cadastro, regra SIGTAP, coleta, consolidação, filtro ou tela de validação será alterada.
