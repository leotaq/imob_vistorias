# Copia e Refresh do Banco

## Objetivo
Este documento define exatamente como a beta deve receber os dados do banco atual sem perder os dados proprios da beta.
Ele separa o processo em duas fases:
- copia inicial do banco atual para a beta
- refresh recorrente da producao para a beta

## Regra principal
- a copia inicial pode ser um clone quase completo do banco
- depois que a beta comecar a operar com login Google e Calendar, nunca mais usar clone cego para refresh
- a partir desse ponto, o refresh deve preservar as tabelas proprias da beta

## Tabelas da beta que nunca devem ser sobrescritas pelo refresh
- `auth_access_requests`
- `person_auth_links`
- `person_google_calendar_links`
- `inspection_google_calendar_events`
- `google_oauth_states`

## Tabelas herdadas do legado que a beta deve receber da producao
- `people`
- `properties`
- `inspections`
- `inspection_status_events`

## Estrategia recomendada

### Fase 1: copia inicial
Objetivo:
- criar o banco beta ja com os dados reais do sistema atual

Opcoes recomendadas:

#### Opcao A: Restore to new project
Usar quando:
- o plano da Supabase permitir backup/restore entre projetos
- voce quiser o caminho mais rapido para clonar o banco atual

Vantagens:
- copia schema, dados, indices e auth schema do projeto de origem
- reduz o trabalho manual da primeira clonagem

Cuidados:
- a documentacao da Supabase diz que isso e um clone de banco, nao um clone completo do projeto
- depois do clone ainda precisa reconfigurar:
  - Auth settings
  - API keys
  - Storage
  - Edge Functions
  - Realtime settings
  - extensoes/configuracoes especificas

#### Opcao B: CLI dump/restore
Usar quando:
- o recurso de restore nao estiver disponivel
- voce quiser controle total do que esta sendo copiado

Vantagens:
- processo reproduzivel por comando
- facilita registrar e automatizar

## Fluxo exato da copia inicial

### Caminho recomendado
1. Criar o projeto Supabase beta vazio.
2. Copiar o banco do projeto atual para o beta.
3. Validar se `people`, `properties`, `inspections` e `inspection_status_events` chegaram.
4. Aplicar as migrations da beta com as tabelas descritas em `08_BANCO_BETA.md`.
5. So depois configurar Google Login, aprovacao manual e Calendar.

### Se usar Restore to new project
Passos:
1. No projeto de origem, abrir a area de backups.
2. Escolher `Restore to a new project`.
3. Selecionar ou criar o projeto beta de destino.
4. Esperar a clonagem terminar.
5. No projeto beta, revisar manualmente:
   - extensoes ativas
   - auth settings
   - redirect URLs
   - providers OAuth
   - storage e buckets
6. Aplicar as migrations proprias da beta.

Resultado esperado:
- o beta nasce com os dados atuais da producao
- ainda sem a infraestrutura completa do novo fluxo Google

### Se usar CLI dump/restore
Prerequisitos:
- `npx supabase` disponivel
- `psql` instalado
- connection string do banco de origem
- connection string do banco beta

Arquivos sugeridos:
- `roles.sql`
- `schema.sql`
- `data.sql`

Comandos de dump recomendados:

```bash
npx supabase db dump --db-url "$SOURCE_DB_URL" -f roles.sql --role-only
npx supabase db dump --db-url "$SOURCE_DB_URL" -f schema.sql
npx supabase db dump --db-url "$SOURCE_DB_URL" -f data.sql --use-copy --data-only
```

Comandos de restore recomendados:

```bash
psql "$TARGET_DB_URL" -f roles.sql
psql "$TARGET_DB_URL" -f schema.sql
psql "$TARGET_DB_URL" -f data.sql
```

Depois disso:
- aplicar as migrations da beta
- validar as tabelas novas

## Estrategia de refresh recorrente

### Regra mais importante
Depois que a beta tiver:
- logins aprovados
- links de auth
- Calendar conectado

nao usar mais `Restore to new project` nem refresh cego do banco inteiro.

Motivo:
- isso sobrescreveria ou apagaria as tabelas proprias da beta

### Estrategia v1 recomendada para refresh
Usar refresh por categoria de tabela:

#### 1. Preservar completamente
Estas tabelas ficam intocadas:
- `auth_access_requests`
- `person_auth_links`
- `person_google_calendar_links`
- `inspection_google_calendar_events`
- `google_oauth_states`

#### 2. Refresh por merge/upsert
Estas tabelas devem ser atualizadas sem apagar o que sustenta os vinculos da beta:
- `people`
- `properties`

Regra recomendada:
- inserir novos registros
- atualizar registros existentes pelo mesmo `id`
- nao remover fisicamente pessoas ausentes da origem
- se uma pessoa sumir da origem, preferir marcar `active = false` na beta

Motivo:
- `person_auth_links` e `person_google_calendar_links` dependem de `people`
- apagar e recriar pessoas pode quebrar os vinculos da beta

#### 3. Refresh de negocio com reconciliacao
Estas tabelas podem ser sincronizadas por carga de negocio:
- `inspections`
- `inspection_status_events`

Regra recomendada:
- importar os registros da origem
- fazer upsert por `id`
- atualizar campos alterados
- remover ou cancelar registros ausentes apenas se houver uma rotina de reconciliacao segura

Default escolhido para v1:
- nao apagar automaticamente vistorias ausentes na origem
- manter uma rotina de reconciliacao posterior se isso virar problema

Motivo:
- isso evita apagar mapeamentos do Calendar e reduz risco operacional

## Procedimento operacional do refresh

### Pre-flight
- pausar jobs de sync do Google Calendar, se existirem
- confirmar que o target e o projeto beta correto
- confirmar backup recente do beta
- confirmar que as envs de origem e destino estao corretas

### Passo 1: exportar dados da origem
Recomendacao:
- exportar apenas as tabelas de negocio herdadas do legado
- nao importar auth schema do projeto atual para dentro do beta em refreshs recorrentes

Opcoes praticas:
- usar script Node com leituras via service role e gravacao via service role
- ou usar staging tables + merge SQL no banco beta

### Passo 2: carregar em staging no beta
Estrutura sugerida:
- schema temporario `refresh_staging`
- tabelas:
  - `refresh_staging.people`
  - `refresh_staging.properties`
  - `refresh_staging.inspections`
  - `refresh_staging.inspection_status_events`

Uso:
- carregar dados exportados da origem para staging
- validar contagem antes de mesclar no schema final

### Passo 3: merge controlado
Ordem recomendada:
1. `people`
2. `properties`
3. `inspections`
4. `inspection_status_events`

Regras de merge:
- `people`: upsert por `id`, marcar faltantes como inativos
- `properties`: upsert por `id`
- `inspections`: upsert por `id`
- `inspection_status_events`: upsert por `id`

### Passo 4: reconciliar dados beta
Depois do merge:
- remover `inspection_google_calendar_events` orfaos, se existirem
- manter `person_auth_links` e `person_google_calendar_links`
- revisar erros de sync acumulados

### Passo 5: retomar jobs
- religar sincronizacao do Google Calendar
- rodar uma rotina de `resync` para agendas afetadas

## Estrategia recomendada de implementacao futura

### Script 1: copia inicial
Nome sugerido:
- `scripts/beta-clone-initial.mjs`

Objetivo:
- validar envs
- orientar restore ou dump/restore
- registrar o snapshot inicial

### Script 2: refresh recorrente
Nome sugerido:
- `scripts/beta-refresh-from-source.mjs`

Objetivo:
- ler dados do projeto atual
- carregar staging no beta
- aplicar merge seguro
- emitir relatorio final de contagem

## Checklist da copia inicial
- [ ] projeto Supabase beta criado
- [ ] source project confirmado
- [ ] target project confirmado
- [ ] metodo escolhido: restore ou CLI
- [ ] `people` copiada
- [ ] `properties` copiada
- [ ] `inspections` copiada
- [ ] `inspection_status_events` copiada
- [ ] migrations da beta aplicadas
- [ ] auth beta configurado depois da copia

## Checklist do refresh recorrente
- [ ] beta ja tem suas tabelas proprias criadas
- [ ] backup recente do beta confirmado
- [ ] sync Google pausado
- [ ] export da origem concluido
- [ ] staging carregado
- [ ] merge de `people` concluido
- [ ] merge de `properties` concluido
- [ ] merge de `inspections` concluido
- [ ] merge de `inspection_status_events` concluido
- [ ] reconciliacao de orfaos concluida
- [ ] sync Google retomado

## O que nao fazer
- nao usar clone cego recorrente depois que a beta comecar a ter usuarios e Calendar
- nao truncar `people` enquanto existirem `person_auth_links`
- nao sobrescrever tabelas beta com dados da origem
- nao misturar o Supabase legado e o beta na mesma env local

## Referencias oficiais
- Supabase Restore to a new project: https://supabase.com/docs/guides/platform/clone-project
- Supabase Migrating within Supabase: https://supabase.com/docs/guides/platform/migrating-within-supabase
- Supabase CLI `db dump`: https://supabase.com/docs/reference/cli/supabase-db-dump
- Supabase Database migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Supabase auth migration notes: https://supabase.com/docs/guides/troubleshooting/migrating-auth-users-between-projects
