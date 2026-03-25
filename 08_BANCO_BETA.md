# Banco Beta

## Objetivo
Este documento define o que precisa existir no banco da beta alem do schema atual do legado.
Ele serve como baseline para as futuras migrations, evitando que a proxima IA precise redesenhar o banco do zero.

## Regra principal
- reaproveitar as tabelas do legado como base
- adicionar novas tabelas para auth real e Google Calendar
- nao quebrar o dominio atual de `people`, `properties`, `inspections` e `inspection_status_events`
- guardar tokens do Google Calendar sempre criptografados antes de persistir

## Base herdada do legado
Estas estruturas continuam existindo na beta:
- `people`
- `properties`
- `inspections`
- `inspection_status_events`

Uso esperado:
- `people` continua sendo a referencia funcional de quem opera no sistema
- `inspections` continua sendo a entidade principal do negocio
- a autenticacao real passa a ser ligada a `people` por tabela auxiliar, nao por substituicao total do modelo atual

## Tabelas novas recomendadas

### `auth_access_requests`
Finalidade:
- registrar tentativas de entrada via Google antes da aprovacao administrativa

Colunas recomendadas:
- `id uuid primary key default gen_random_uuid()`
- `auth_user_id uuid not null references auth.users(id) on delete cascade`
- `email text not null`
- `full_name text null`
- `avatar_url text null`
- `provider text not null default 'google'`
- `status text not null default 'pending'`
- `requested_at timestamptz not null default now()`
- `reviewed_at timestamptz null`
- `reviewed_by uuid null references people(id)`
- `notes text null`

Regras:
- `status` deve aceitar `pending`, `approved`, `rejected` e `revoked`
- `auth_user_id` deve ser unico
- index recomendado em `status, requested_at desc`

Uso esperado:
- quando um usuario entra com Google e ainda nao esta vinculado, cria ou atualiza um pedido pendente
- ao aprovar, o pedido vira `approved` e passa a coexistir com `person_auth_links`

### `person_auth_links`
Finalidade:
- vincular uma conta autenticada do Supabase Auth a uma pessoa existente do sistema

Colunas recomendadas:
- `id uuid primary key default gen_random_uuid()`
- `person_id uuid not null references people(id) on delete cascade`
- `auth_user_id uuid not null references auth.users(id) on delete cascade`
- `email text not null`
- `provider text not null default 'google'`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `created_by uuid null references people(id)`
- `revoked_at timestamptz null`
- `revoked_by uuid null references people(id)`

Regras:
- `person_id` deve ter no maximo um vinculo ativo
- `auth_user_id` deve ter no maximo um vinculo ativo
- unique recomendado em `person_id`
- unique recomendado em `auth_user_id`
- index recomendado em `active, person_id`

Uso esperado:
- o backend resolve o usuario autenticado da beta por esta tabela
- o fallback administrativo pode continuar usando o fluxo antigo apenas quando explicitamente permitido

### `person_google_calendar_links`
Finalidade:
- guardar a conexao de Google Calendar de cada vistoriador

Colunas recomendadas:
- `person_id uuid primary key references people(id) on delete cascade`
- `google_email text not null`
- `calendar_id text not null`
- `calendar_summary text null`
- `refresh_token_encrypted text not null`
- `access_token_encrypted text null`
- `token_expires_at timestamptz null`
- `scope text null`
- `sync_enabled boolean not null default true`
- `last_sync_at timestamptz null`
- `last_sync_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Regras:
- so faz sentido para pessoas com role `inspector`
- deve usar trigger de `updated_at`
- tokens nunca devem ser salvos em texto puro
- index recomendado em `sync_enabled`

Uso esperado:
- ao conectar a agenda Google, o sistema cria ou atualiza essa linha
- ao desconectar, pode manter o historico e desligar `sync_enabled`

### `inspection_google_calendar_events`
Finalidade:
- mapear cada vistoria sincronizada para o evento correspondente no Google Calendar

Colunas recomendadas:
- `inspection_id uuid primary key references inspections(id) on delete cascade`
- `person_id uuid not null references people(id) on delete cascade`
- `calendar_id text not null`
- `google_event_id text not null`
- `event_etag text null`
- `sync_state text not null default 'synced'`
- `last_synced_at timestamptz not null default now()`
- `last_sync_error text null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Regras:
- `sync_state` deve aceitar `synced`, `error` e `deleted`
- unique recomendado em `calendar_id, google_event_id`
- index recomendado em `person_id, last_synced_at desc`
- trigger de `updated_at`

Uso esperado:
- agendar, reagendar, cancelar, excluir ou trocar vistoriador deve atualizar esta tabela
- se a vistoria mudar de vistoriador, o evento antigo deve ser removido do calendario anterior e um novo mapeamento deve ser criado

### `google_oauth_states`
Finalidade:
- proteger o callback do OAuth do Google Calendar

Colunas recomendadas:
- `state text primary key`
- `person_id uuid not null references people(id) on delete cascade`
- `purpose text not null default 'calendar_connect'`
- `expires_at timestamptz not null`
- `used_at timestamptz null`
- `created_at timestamptz not null default now()`

Regras:
- o `state` deve ser de uso unico
- o callback precisa validar expiracao e `used_at is null`
- index recomendado em `person_id, expires_at`

Uso esperado:
- gerado no inicio da conexao do Calendar
- consumido no callback

## Objetos auxiliares recomendados
- reutilizar `set_updated_at()` do schema atual
- adicionar triggers de `updated_at` nas tabelas que tiverem `updated_at`
- criar enums ou checks simples apenas quando ajudarem na consistencia; se quiser menos atrito, usar `text + check`

## Fluxo de dados esperado

### Login Google
1. usuario autentica via Supabase Auth
2. backend procura `person_auth_links` ativo pelo `auth_user_id`
3. se existir, resolve a pessoa
4. se nao existir, cria/atualiza `auth_access_requests` como `pending`
5. admin aprova e cria `person_auth_links`

### Calendar Google
1. vistoriador autenticado pede conexao
2. backend cria `google_oauth_states`
3. callback troca `code` por tokens
4. backend cria/atualiza `person_google_calendar_links`
5. sincronizacoes criam/atualizam `inspection_google_calendar_events`

### Refresh producao -> beta
- refresh deve atualizar apenas os dados de negocio herdados
- nao deve sobrescrever:
  - `auth_access_requests`
  - `person_auth_links`
  - `person_google_calendar_links`
  - `inspection_google_calendar_events`
  - `google_oauth_states`

## O que precisa virar migration
- criacao das cinco tabelas novas
- constraints, uniques e indexes descritos acima
- triggers de `updated_at` onde houver `updated_at`
- qualquer ajuste minimo de compatibilidade nas queries do app beta

## O que nao fazer
- nao misturar tokens do Google com a tabela `people`
- nao depender apenas do email da sessao sem persistir o vinculo
- nao usar o mesmo projeto Supabase do legado esperando isolamento completo
