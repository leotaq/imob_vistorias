# MVP - Gestao de Vistorias (Sem Login)

Aplicacao web (desktop-first) para imobiliaria gerenciar vistorias com agenda por vistoriador, sem autenticacao por usuario.

## Stack

- Next.js 16 + TypeScript + App Router
- Tailwind CSS
- Supabase Postgres (sem Supabase Auth)
- FullCalendar (agenda semanal)
- Deploy recomendado: Vercel

## Funcionalidades do MVP

- Selecao de pessoa no inicio (gestora ou vistoriador) sem login.
- Cadastro de pessoas (gestores/vistoriadores) em `/admin/pessoas`, protegido por PIN admin.
- Gestora cria vistorias com:
  - tipo
  - data/hora de registro (automatica)
  - codigo do imovel
  - endereco
  - data do contrato (opcional)
  - observacoes (opcional)
  - vistoriador responsavel
- Cadastro inteligente de imoveis por codigo:
  - reaproveita endereco no proximo cadastro
  - preenche prazo/observacoes pela ultima vistoria do mesmo codigo
  - botao "Ver no mapa" (Google Maps) sem custo de API
- Vistoriador recebe/agende vistoria com:
  - horario de inicio
  - duracao prevista
- Notificacao opcional por WhatsApp nos eventos:
  - vistoria agendada (`received`)
  - vistoria concluida/finalizada (`completed` / `finalized`)
  - disparo manual da gestora para o vistoriador
  - disparo manual do vistoriador na conclusao
- Fluxo de status:
  - `new` -> `received` -> `in_progress` -> `completed` -> `finalized`
  - `in_progress` -> `finalized` (quando ja puder encerrar direto)
  - `canceled` (somente gestora)
- Calendario semanal (Seg-Sex, 08:00-18:00) com bloqueio de conflitos de horario por vistoriador.
- Sugestao de proximo horario quando houver conflito.
- Dashboard operacional em `/dashboard` com:
  - filtros por periodo, cidade, tipo, status, gestora e vistoriador
  - KPIs de volume, SLA, atrasos e tempo medio
  - graficos de evolucao diaria, tipo, cidade e status
  - ranking de gestoras e vistoriadores
  - exportacao de relatorio mensal em PDF

## Observacao de seguranca

O sistema foi feito sem autenticacao individual por usuario. Se o link da aplicacao vazar, qualquer pessoa com acesso ao link pode operar o sistema.

## Configuracao local

### 1) Instalar dependencias

```bash
npm install
```

### 2) Criar banco no Supabase

- Crie um projeto no Supabase.
- Abra o SQL Editor.
- Execute o arquivo `supabase/schema.sql`.

### 3) Configurar variaveis de ambiente

Crie `.env.local` com base em `.env.example`:

```env
SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PIN=...
CRON_SECRET=...
SUPABASE_PROJECT_REF=...
SUPABASE_ACCESS_TOKEN=...
SUPABASE_KEEPALIVE_TABLE=people
SUPABASE_AUTO_RESTORE=1
```

### 4) Rodar o projeto

```bash
npm run dev
```

Abra `http://localhost:3000`.

### 5) Smoke test automatizado (opcional)

```bash
powershell -ExecutionPolicy Bypass -File scripts/smoke-test.ps1 -Port 4040
```

Esse script sobe o app localmente, valida os fluxos principais da API (criacao, recebimento, conflito, status, calendario e PIN admin) e limpa os dados de teste ao final.

## Primeiro uso (fluxo recomendado)

1. Acesse `Admin` no menu (rota `/admin/pessoas`).
2. Informe o `ADMIN_PIN`.
3. Cadastre ao menos:
   - 1 gestora
   - 1 vistoriador
   - telefone WhatsApp da gestora (para receber alertas)
4. Volte para `/` e selecione a pessoa.
5. Gestora cria vistorias em `/vistorias`.
6. Vistoriador recebe/agende e atualiza status.
7. Acompanhe agenda em `/calendario`.
8. Acompanhe metricas e exporte relatorios em `/dashboard`.

## Endpoints principais

- `POST /api/admin/verify` (valida PIN admin)
- `GET /api/people`
- `POST /api/people` (PIN admin)
- `PATCH /api/people/:id` (PIN admin)
- `GET /api/inspections`
- `POST /api/inspections` (gestora)
- `PATCH /api/inspections/:id` (gestora autora da solicitacao)
- `GET /api/properties/lookup?code=...` (gestora)
- `POST /api/inspections/:id/receive` (vistoriador)
- `POST /api/inspections/:id/status`
- `POST /api/inspections/:id/notify` (manual: gestora ou vistoriador)
- `GET /api/calendar`
- `GET /api/dashboard/metrics`
- `GET /api/keepalive` (cron keepalive/restore)

## Deploy na Vercel

No projeto da Vercel, configure as variaveis:

- Obrigatorias:
  - `SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `SUPABASE_PROJECT_REF`
  - `SUPABASE_ACCESS_TOKEN`
  - `SUPABASE_KEEPALIVE_TABLE=people`
  - `SUPABASE_AUTO_RESTORE=1`
  - `ADMIN_PIN`
  - `CRON_SECRET` (protecao do endpoint de cron)

Depois, faca deploy normal do repositorio.

Checklist rapido apos deploy:

1. Abra `https://SEU_DOMINIO/api/people`
2. Resultado esperado:
   - `200` com `{ "people": [...] }`
3. Se vier `500`:
   - revise nomes das variaveis no painel da Vercel (sem espacos)
   - clique em `Redeploy` para aplicar as novas variaveis

## Scripts para reduzir pausa no Free

Este projeto tem dois scripts para operacao com Supabase:

1. `npm run keepalive:supabase`
   - Faz um ping leve na API de dados (`/rest/v1/...`) para registrar atividade.
   - Se `SUPABASE_AUTO_RESTORE=1`, tambem consulta o status do projeto e dispara restore quando estiver `INACTIVE`.
2. `npm run restore:supabase`
   - Consulta o status do projeto e dispara `restore` quando estiver `INACTIVE`.
   - Use `npm run restore:supabase -- --force` para forcar restore manual.
3. `GET /api/keepalive`
   - Endpoint para ser chamado por cron na Vercel.
   - Faz ping no banco e, opcionalmente, restore quando `SUPABASE_AUTO_RESTORE=1`.
   - Quando `CRON_SECRET` estiver definido, exige header `Authorization: Bearer <CRON_SECRET>`.

Variaveis usadas:

```env
SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
ADMIN_PIN=...
CRON_SECRET=...
SUPABASE_PROJECT_REF=seu_project_ref # recomendado explicito
SUPABASE_ACCESS_TOKEN=...            # token da conta para Management API
SUPABASE_KEEPALIVE_TABLE=people      # tabela para ping
SUPABASE_AUTO_RESTORE=1              # 1 para auto-restore no script keepalive
```

## Notificacoes WhatsApp (opcional)

O envio de WhatsApp e opcional e nao bloqueia o fluxo de vistoria em caso de falha de envio.

1. Cadastre o campo WhatsApp da gestora em `Admin > Pessoas`.
2. Ative variaveis no ambiente:

```env
WHATSAPP_NOTIFICATIONS_ENABLED=1
WHATSAPP_PROVIDER=webhook # ou meta
WHATSAPP_DEFAULT_COUNTRY_CODE=55
WHATSAPP_TIMEZONE=America/Sao_Paulo
WHATSAPP_NOTIFY_EXTRA_TO=+5511999999999,+5511888888888
```

Provider `webhook`:

```env
WHATSAPP_WEBHOOK_URL=https://seu-webhook
WHATSAPP_WEBHOOK_TOKEN=opcional
```

Provider `meta` (WhatsApp Cloud API):

```env
WHATSAPP_META_API_VERSION=v22.0
WHATSAPP_META_PHONE_NUMBER_ID=...
WHATSAPP_META_ACCESS_TOKEN=...
```

Agendamento recomendado (Vercel Cron):

1. Este repositorio ja inclui `vercel.json` com cron em `/api/keepalive`.
2. Ao fazer deploy na Vercel, o cron passa a rodar automaticamente.
3. Se quiser alterar horario, ajuste `vercel.json` (formato cron padrao UTC).

Opcao local (Windows Task Scheduler):

1. Programa/script: `npm.cmd`
2. Argumentos: `run keepalive:supabase`
3. Iniciar em: pasta do projeto
4. Frequencia: a cada 30 min ou 1h

Observacao: no plano Free nao ha garantia contratual de disponibilidade continua.
