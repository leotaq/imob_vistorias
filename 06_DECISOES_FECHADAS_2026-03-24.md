# Decisoes Fechadas em 2026-03-24

## Estrategia geral
- Nao criar um produto totalmente do zero.
- Usar o projeto atual como semente do novo trabalho.
- Criar uma pasta irma para abrir em outro workspace com contexto proprio.

## Isolamento
- A beta sera separada do legado.
- A beta usara outro projeto Vercel.
- A beta usara outro projeto Supabase.
- Os dois projetos Supabase podem ficar na mesma organization/conta, mas nao no mesmo projeto.

## Banco e dados
- A beta recebe uma copia da producao como ponto de partida.
- O refresh entre producao e beta sera frequente.
- O refresh deve preservar os dados especificos da beta.
- Os dados usados na beta serao dados reais.

## Login
- Todos os perfis entram com Google Login na beta.
- O seletor manual antigo nao sera o fluxo principal.
- O seletor antigo pode sobreviver apenas como fallback para admin/dev.
- O vinculo entre conta Google e pessoa existente sera por aprovacao manual.

## Google Calendar
- Escopo inicial apenas para vistoriadores.
- Sincronizacao em um unico sentido: `sistema -> Google`.
- O sistema continua sendo a fonte oficial da agenda.

## Operacao
- O legado continua sendo a referencia operacional.
- A beta e um ambiente de teste e evolucao, nao um deploy para substituir a producao atual.
- Antes da implementacao, a nova workspace precisa ter documentacao suficiente para outra IA retomar o trabalho sozinha.

## Ponto exato onde o trabalho ficou
- A estrutura seed foi criada.
- A documentacao de handoff foi criada.
- O proximo passo e iniciar a implementacao tecnica da beta pelo corte de autenticacao.
