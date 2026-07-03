## Problema real

O rodapé institucional está aparecendo **no meio das páginas impressas**, sobreposto ao texto do documento (confirmado no PDF enviado, páginas 1 e 2).

**Causa:** o CSS atual usa `.doc-footer { position: fixed; bottom: 4mm }` para tentar fixar o rodapé no fim de cada página impressa. Isso é um "hack" que o Chrome **não** implementa de forma consistente em impressão multi-página:
- Em documentos de 1 página funciona.
- Em documentos com 2+ páginas, o Chrome ancora o `bottom` ao viewport ou ao primeiro page-box, resultando em posicionamento errático (às vezes meio da página, às vezes desaparece).

Correções anteriores tentaram ajustar `--doc-footer-bottom-offset`, `@page margin`, `flex layout` — nenhuma resolve o problema **estrutural**: `position: fixed` não é o mecanismo CSS correto para rodapé impresso.

## Solução correta — CSS Paged Media (`@page` margin boxes)

O padrão W3C CSS Paged Media define **caixas de margem** dentro de `@page`, especificamente para cabeçalho/rodapé impressos. O Chrome/Edge suportam plenamente `content:` com string, e o navegador **reserva automaticamente** a área de margem e desenha o conteúdo lá em **cada página**, sem nunca sobrepor o corpo.

```css
@page {
  size: A4;
  margin: 15mm 15mm 22mm 15mm;

  @bottom-center {
    content: "Secretaria Municipal de Saúde de Oriximiná — CER II";
    font-family: Arial, sans-serif;
    font-size: 7.5pt;
    color: #64748b;
  }
  @bottom-left {
    content: "Rua Barão do Rio Branco, S/N — Oriximiná-PA";
    font-size: 7pt;
    color: #94a3b8;
  }
  @bottom-right {
    content: "Página " counter(page) " de " counter(pages);
    font-size: 7pt;
    color: #94a3b8;
  }
}
```

Vantagens:
- Renderizado pelo motor de paginação do navegador — **impossível sobrepor** o conteúdo.
- Repete idêntico em todas as páginas.
- Numeração de página nativa via `counter(page)` / `counter(pages)`.
- Zero JavaScript, zero cálculos frágeis.

## Escopo da mudança

**Arquivo único:** `src/lib/printLayout.ts`

1. **Em `buildInstitutionalCSS`:**
   - Adicionar dinamicamente ao bloco `@page` os `@bottom-left/center/right` com os textos vindos de `config.rodapeTexto`, `config.rodapeEndereco` e `linha1`. Escapar aspas nos textos.
   - Remover as variáveis CSS que existiam só para acomodar o footer fixo: `--doc-footer-space`, `--doc-footer-gap`, `--doc-footer-bottom-offset`, `--doc-screen-bottom-padding`.
   - Simplificar `@page margin-bottom` para valor fixo (ex: `22mm`) — espaço reservado para os @bottom boxes.
   - Em `@media print`: **remover** todo o bloco `.doc-footer { position: fixed; ... }`. O `.doc-footer` fica escondido (`display: none`) na impressão porque o @page cuida disso.

2. **Em `@media screen`:**
   - Manter `.doc-footer` no fluxo (como já está), para o preview mostrar o rodapé no fim do documento.
   - Remover o padding-bottom calculado que existia só para o footer fixo.

3. **Função `docFooter()`** (usada no HTML): manter geração igual para o preview em tela — só o comportamento de impressão muda.

## Riscos e validação

**Compatibilidade:**
- Chrome/Edge: 100% suportado (é o motor usado em "Imprimir → Salvar como PDF").
- Firefox: suporta apenas `@bottom-*` com string simples — funciona.
- Safari: suporta parcialmente — cai no fluxo normal se não renderizar, mas o `.doc-footer` fica escondido na impressão. Como o sistema é usado via Chrome no ambiente clínico, isso é aceitável.

**O que NÃO muda:**
- Preview em tela permanece idêntico.
- Layout do cabeçalho (`.doc-header`) permanece idêntico.
- Todos os documentos que usam `printLayout.ts` (Termo de Compromisso, atestados, receitas, ficha, etc.) herdam a correção sem alteração no código deles.
- Configurações do painel Master (margens, tipografia, texto do rodapé) continuam funcionando.

**QA obrigatório após implementar:**
1. Reimprimir o Termo de Compromisso (documento de 3 páginas).
2. Salvar como PDF.
3. Converter em imagens com `pdftoppm` e inspecionar cada página.
4. Confirmar: rodapé aparece SOMENTE na margem inferior, texto do corpo intacto do início ao fim.
5. Testar também documento curto (1 página) — rodapé ainda deve aparecer na parte inferior.

## Detalhes técnicos

Chrome suporta em `@page`:
- `@top-left`, `@top-center`, `@top-right`
- `@bottom-left`, `@bottom-center`, `@bottom-right`
- Content types: `string`, `counter(page)`, `counter(pages)`, `attr()`
- **Não suporta:** `content: element(name)` (Paged Media Module 3) — por isso o texto tem que ser strings, não HTML rico. Como o rodapé atual já é só 2–3 linhas de texto, isso é irrelevante.

Escapar strings: as aspas duplas dos textos precisam virar `\"` dentro do `content: "..."` gerado.
