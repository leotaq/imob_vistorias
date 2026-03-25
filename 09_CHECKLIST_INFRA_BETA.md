# Checklist Infra Beta

## Objetivo
Este documento e o checklist operacional para nao perder tempo redescobrindo o setup da beta.
Ele lista:
- o que precisa ser criado no Supabase
- o que precisa ser criado no Google Cloud
- o que precisa ser configurado na Vercel
- quais valores precisam ser buscados e onde usar cada um

## Ordem recomendada
1. Definir nome e dominio da beta.
2. Criar projeto Supabase beta.
3. Registrar os valores do projeto Supabase.
4. Configurar Google Login no Supabase Auth.
5. Criar o OAuth do Google Calendar.
6. Criar o projeto beta na Vercel.
7. Cadastrar variaveis de ambiente na Vercel e no `.env.local`.
8. Implementar e rodar as migrations da beta.
9. Validar login e callback antes de mexer no Calendar.
10. Preparar a estrategia de copia inicial e refresh em `10_COPIA_E_REFRESH_BANCO.md`.

## Checklist de busca de informacoes

### Identidade da beta
- [ ] Nome do projeto beta
- [ ] Subdominio beta fixo
- [ ] Branch principal da beta
- [ ] Responsavel pelo projeto no Supabase
- [ ] Responsavel pelo projeto na Vercel
- [ ] Conta Google Cloud que vai ser dona do OAuth

### Supabase beta
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_PROJECT_REF`
- [ ] `SUPABASE_ACCESS_TOKEN`
- [ ] senha do banco do projeto beta
- [ ] Site URL da beta
- [ ] Redirect URLs permitidas
- [ ] provider Google habilitado no Auth
- [ ] connection string/DB URL do projeto beta

### Google Cloud
- [ ] projeto Google Cloud da beta
- [ ] tela de consentimento configurada
- [ ] email de suporte configurado
- [ ] client ID do OAuth de Calendar
- [ ] client secret do OAuth de Calendar
- [ ] redirect URI do Calendar
- [ ] escopos do Calendar definidos

### Vercel beta
- [ ] projeto Vercel separado do legado
- [ ] dominio beta configurado
- [ ] variaveis em Development
- [ ] variaveis em Preview
- [ ] variaveis em Production
- [ ] `CRON_SECRET` configurado se o keepalive for mantido
- [ ] deploy beta isolado do projeto atual

## Supabase beta: o que criar e configurar

### 1. Criar um projeto novo
- criar um projeto Supabase novo para a beta
- usar a mesma organization da conta, se quiser
- nao reutilizar o projeto do legado

Por que:
- Auth, redirect URLs, chaves e servicos integrados ficam no nivel do projeto
- isso evita conflito entre beta e producao

### 2. Registrar os valores do projeto
No painel do Supabase beta, anotar:
- Project URL
- anon/public key
- service role key
- project ref
- DB password

Uso desses valores:
- `.env.local` da beta
- Environment Variables da Vercel beta
- scripts de automacao

### 3. Configurar URL Configuration do Auth
No Supabase beta, cadastrar:
- Site URL = dominio beta fixo
- Redirect URLs adicionais

Lista recomendada:
- `http://localhost:3000/**`
- `https://SEU-DOMINIO-BETA/**`
- opcional: URLs de preview da Vercel se voce realmente for testar auth em previews

Observacao:
- para login Google, e mais seguro padronizar um dominio beta fixo
- previews podem ser uteis, mas aumentam a complexidade de allowlist

### 4. Habilitar Google Login no Auth
No Supabase beta:
- abrir Auth > Providers
- habilitar Google
- preencher o client ID e client secret do Google Login

Importante:
- isso e configuracao do projeto Supabase
- nao precisa expor esses valores como env da aplicacao

### 5. Aplicar o schema da beta
Passos esperados:
- aplicar o schema atual herdado do legado
- criar migrations novas para o que esta em `08_BANCO_BETA.md`
- confirmar que as cinco tabelas novas existem

## Google Cloud: o que criar e configurar

### 1. Google Login para Supabase Auth
No Google Cloud:
- criar ou escolher um projeto
- configurar a tela de consentimento
- criar um OAuth Client do tipo Web application para o login

Buscar no Supabase:
- copiar o callback/redirect URI mostrado na configuracao do provider Google do Supabase beta

No Google Cloud, cadastrar:
- Authorized JavaScript origins:
  - `http://localhost:3000`
  - dominio beta fixo
- Authorized redirect URIs:
  - o callback mostrado pelo Supabase beta

Observacao:
- se o dominio beta mudar, isso precisa ser revisado aqui e no Supabase

### 2. Google Calendar OAuth separado
Para o Calendar, usar um OAuth proprio da beta.

Criar no Google Cloud:
- OAuth Client do tipo Web application
- redirect URI especifico para o backend beta, por exemplo:
  - `https://SEU-DOMINIO-BETA/api/google-calendar/callback`
  - `http://localhost:3000/api/google-calendar/callback`

Escopos recomendados para v1:
- `openid`
- `email`
- `profile`
- `https://www.googleapis.com/auth/calendar.events`
- se precisar criar/gerenciar um calendario dedicado, avaliar tambem `https://www.googleapis.com/auth/calendar`

Informacoes para guardar:
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_SCOPES`

## Vercel beta: o que criar e configurar

### 1. Criar projeto separado
- criar um projeto Vercel separado do legado
- apontar para a branch da beta ou para o repositorio que vai hospedar a beta
- nao reaproveitar o projeto `visto-new` do legado

### 2. Configurar dominio
- definir um dominio beta fixo
- usar esse dominio como base de:
  - `APP_BASE_URL`
  - Site URL do Supabase beta
  - callbacks do Google Calendar

### 3. Cadastrar environment variables
Cadastrar pelo menos:
- `APP_VARIANT=beta`
- `NEXT_PUBLIC_APP_VARIANT=beta`
- `APP_BASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `ADMIN_PIN`
- `CRON_SECRET`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CALENDAR_SCOPES`
- `BETA_REFRESH_SOURCE_SUPABASE_URL`
- `BETA_REFRESH_SOURCE_SERVICE_ROLE_KEY`

Ambientes recomendados:
- Development
- Preview
- Production

Importante:
- qualquer mudanca nessas variaveis exige novo deploy
- para desenvolvimento local, usar `vercel env pull` ou preencher `.env.local` manualmente

### 4. Cron / keepalive
Se a beta mantiver o `vercel.json` atual:
- conferir se o cron em `/api/keepalive` faz sentido para o projeto beta
- definir um `CRON_SECRET` proprio da beta
- confirmar que o keepalive aponta para o Supabase beta

## Tabela rapida: de onde vem cada valor

| Valor | Onde buscar | Onde cadastrar |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase beta > Project Settings / API | `.env.local` e Vercel |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase beta > Project Settings / API | `.env.local` e Vercel |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase beta > Project Settings / API | `.env.local` e Vercel |
| `SUPABASE_PROJECT_REF` | URL/painel do projeto Supabase beta | `.env.local` e Vercel |
| `SUPABASE_ACCESS_TOKEN` | conta Supabase usada para automacao | `.env.local` e Vercel |
| `APP_BASE_URL` | dominio beta definido para a app | `.env.local` e Vercel |
| `ADMIN_PIN` | definido pela equipe | `.env.local` e Vercel |
| `CRON_SECRET` | definido pela equipe | `.env.local` e Vercel |
| `GOOGLE_CALENDAR_CLIENT_ID` | Google Cloud > OAuth client do Calendar | `.env.local` e Vercel |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | Google Cloud > OAuth client do Calendar | `.env.local` e Vercel |
| `GOOGLE_CALENDAR_REDIRECT_URI` | rota callback da beta | Google Cloud, `.env.local` e Vercel |
| `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY` | gerado pela equipe | `.env.local` e Vercel |
| `GOOGLE_CALENDAR_SCOPES` | decisoes do escopo do Calendar | `.env.local` e Vercel |
| `BETA_REFRESH_SOURCE_SUPABASE_URL` | projeto Supabase legado | `.env.local` e Vercel |
| `BETA_REFRESH_SOURCE_SERVICE_ROLE_KEY` | projeto Supabase legado | `.env.local` e Vercel |
| `BETA_REFRESH_SOURCE_PROJECT_REF` | URL/painel do projeto Supabase legado | `.env.local` e Vercel |
| `BETA_REFRESH_SOURCE_DB_URL` | connect string do Postgres do projeto legado | uso local/automacao |
| `BETA_REFRESH_TARGET_DB_URL` | connect string do Postgres do projeto beta | uso local/automacao |

## Checklist tecnico antes de implementar
- [ ] projeto Supabase beta criado
- [ ] projeto Vercel beta criado
- [ ] dominio beta fixo definido
- [ ] Google Login habilitado no Supabase beta
- [ ] OAuth do Google Calendar criado
- [ ] `.env.local` beta preenchido
- [ ] envs da Vercel beta preenchidas
- [ ] migrations planejadas a partir de `08_BANCO_BETA.md`
- [ ] fluxo de callback decidido para login e para Calendar
- [ ] estrategia de copia inicial e refresh revisada em `10_COPIA_E_REFRESH_BANCO.md`

## Checklist tecnico antes do primeiro deploy beta
- [ ] `npm run build` local ok
- [ ] login Google redireciona corretamente
- [ ] usuario sem vinculo cai em pendencia
- [ ] admin consegue aprovar
- [ ] callback do Calendar responde no dominio beta
- [ ] Vercel usa o Supabase beta, nao o legado
- [ ] cron, se mantido, usa segredos proprios da beta

## Referencias oficiais consultadas
- Supabase Redirect URLs: https://supabase.com/docs/guides/auth/redirect-urls
- Supabase Login with Google: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase Managing Environments: https://supabase.com/docs/guides/deployment/managing-environments
- Supabase sobre bancos manuais no mesmo projeto: https://supabase.com/docs/guides/troubleshooting/manually-created-databases-are-not-visible-in-the-supabase-dashboard-4415aa
- Vercel Project Settings: https://vercel.com/docs/projects/project-configuration/project-settings
- Vercel Environment Variables: https://vercel.com/docs/environment-variables
