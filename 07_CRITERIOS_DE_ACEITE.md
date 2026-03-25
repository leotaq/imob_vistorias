# Criterios de Aceite

## Base pronta para desenvolvimento
Esta workspace seed estara pronta quando:
- abrir sozinha em outra janela sem depender da pasta antiga
- contiver a base do codigo legado necessaria para reutilizacao
- nao carregar `.git`, `.env.local`, `.vercel`, `.next` nem `node_modules` da pasta original
- contiver documentacao suficiente para outra IA entender contexto, metas e proximos passos
- permitir instalar dependencias e rodar `npm run build` com um `.env.local` proprio

## Documentacao considerada suficiente quando
Uma nova IA, lendo apenas esta pasta, consegue responder:
- o que e o sistema atual
- por que a beta foi separada
- como sera o login Google
- como sera o Google Calendar
- quais arquivos devem ser reaproveitados
- qual e o proximo passo de implementacao

## Beta pronta para teste interno quando
- existir login Google funcional para todos os perfis
- usuario nao vinculado cair em acesso pendente
- admin conseguir aprovar e vincular a conta a uma pessoa existente
- o fluxo principal da beta nao depender mais do seletor manual de pessoa
- vistoriador conseguir conectar a propria agenda Google
- receber/agendar/reagendar/cancelar/excluir vistoria sincronizar o evento certo
- falha no Google Calendar nao bloquear o fluxo operacional
- a beta continuar isolada do legado

## Testes minimos esperados na implementacao da beta

### Unitarios
- resolucao da variante `legacy` vs `beta`
- regras de permissao para pedidos de acesso e aprovacao
- normalizacao e mapeamento de sync do Google Calendar

### Integracao
- login Google sem vinculo gera pedido pendente
- aprovacao admin libera o acesso correto
- criacao e atualizacao de evento no Google Calendar
- remocao de evento quando agendamento deixa de valer
- refresh de dados preserva tabelas beta

### E2E
- login Google completo
- aprovacao administrativa
- entrada no app como usuario aprovado
- sincronizacao de agenda por vistoriador

## Regra final
Nenhum aceite da beta compensa quebrar o legado. Se houver conflito entre acelerar a beta e preservar a producao atual, prevalece a preservacao do legado.
