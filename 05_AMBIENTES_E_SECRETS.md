# Ambientes e Secrets

## Regra geral
Esta pasta nao deve receber segredos copiados do legado.
O novo `.env.local` da beta precisa ser proprio.
O passo a passo operacional para preencher tudo esta em `09_CHECKLIST_INFRA_BETA.md`.
Existe tambem um modelo pronto em `.env.beta.example`.

## O que nao copiar do projeto atual
- `.env.local`
- tokens da Vercel
- credenciais do projeto Supabase legado
- chaves de provedores externos em uso na producao
- qualquer credencial salva em ferramenta local do usuario

## Variaveis atuais do legado
Hoje o legado usa, no minimo:
- `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_PIN`
- `CRON_SECRET`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_KEEPALIVE_TABLE`
- `SUPABASE_AUTO_RESTORE`

O legado tambem pode usar variaveis opcionais de WhatsApp:
- `WHATSAPP_NOTIFICATIONS_ENABLED`
- `WHATSAPP_PROVIDER`
- `WHATSAPP_DEFAULT_COUNTRY_CODE`
- `WHATSAPP_TIMEZONE`
- `WHATSAPP_NOTIFY_EXTRA_TO`
- `WHATSAPP_WEBHOOK_URL`
- `WHATSAPP_WEBHOOK_TOKEN`
- `WHATSAPP_META_API_VERSION`
- `WHATSAPP_META_PHONE_NUMBER_ID`
- `WHATSAPP_META_ACCESS_TOKEN`

## Variaveis propostas para a beta
Estas variaveis devem ser consideradas o baseline da nova implementacao:
- `APP_VARIANT=beta`
- `NEXT_PUBLIC_APP_VARIANT=beta`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_PROJECT_REF`
- `SUPABASE_ACCESS_TOKEN`
- `ADMIN_PIN`
- `CRON_SECRET`
- `APP_BASE_URL`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CALENDAR_SCOPES`
- `BETA_REFRESH_SOURCE_SUPABASE_URL`
- `BETA_REFRESH_SOURCE_SERVICE_ROLE_KEY`

## Papel de cada bloco

### Basico da app beta
- `APP_VARIANT` e `NEXT_PUBLIC_APP_VARIANT`: separam o comportamento beta do legado
- `APP_BASE_URL`: links absolutos e callbacks

### Supabase beta
- `NEXT_PUBLIC_SUPABASE_URL`: URL publica do Supabase beta
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave publica para login no cliente
- `SUPABASE_SERVICE_ROLE_KEY`: chave server-side do Supabase beta
- `SUPABASE_PROJECT_REF` e `SUPABASE_ACCESS_TOKEN`: operacao/automacao do projeto beta

### Google Calendar
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_TOKEN_ENCRYPTION_KEY`
- `GOOGLE_CALENDAR_SCOPES`

### Refresh producao -> beta
- `BETA_REFRESH_SOURCE_SUPABASE_URL`
- `BETA_REFRESH_SOURCE_SERVICE_ROLE_KEY`
- `BETA_REFRESH_SOURCE_PROJECT_REF`
- `BETA_REFRESH_SOURCE_DB_URL`
- `BETA_REFRESH_TARGET_DB_URL`

## Defaults operacionais
- nao apontar a beta para o Supabase legado
- nao reaproveitar redirect URLs do legado
- nao colocar credenciais beta em arquivos versionados
- so ativar WhatsApp na beta se isso for necessario para teste e com aprovacao explicita

## Observacao importante sobre Google Login
Para Supabase Auth com Google, a configuracao do provider acontece no projeto Supabase beta.
Por isso a beta precisa de projeto Supabase proprio, mesmo ficando na mesma organization da conta.

## Observacao importante sobre Vercel
- as variaveis precisam ser cadastradas por ambiente no projeto beta da Vercel
- qualquer alteracao de env na Vercel exige novo deploy para entrar em vigor
- `vercel env pull` deve ser usado para trazer as variaveis de Development para a maquina local

## Atalho pratico
Se a duvida for "onde encontro esse valor?" ou "onde preciso cadastrar isso?", consulte `09_CHECKLIST_INFRA_BETA.md`.
Se a duvida for "como a beta vai copiar e atualizar os dados do banco atual?", consulte `10_COPIA_E_REFRESH_BANCO.md`.
