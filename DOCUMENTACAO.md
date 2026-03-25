# Documentacao Geral do Sistema - Gestao de Vistorias Imobiliarias

Este documento fornece uma visao completa da arquitetura, funcionamento, integracao e deploy do sistema de gestao de vistorias imobiliarias.

---

## 1. Visao Geral

Aplicacao web full-stack para gestao de vistorias imobiliarias (Alice Imoveis), construida com:

- **Framework:** Next.js 16 (App Router, `src/app`)
- **Linguagem:** TypeScript
- **Estilizacao:** Tailwind CSS v4 (tema dark-only)
- **Banco de Dados:** Supabase (PostgreSQL)
- **Graficos:** Apache ECharts (dashboard)
- **Calendario:** FullCalendar (agenda semanal)
- **PDF:** jsPDF + jspdf-autotable (exportacao de relatorios)
- **Notificacoes:** WhatsApp via webhook ou Meta Cloud API
- **Deploy:** Vercel (CI/CD automatico via GitHub)

O Next.js atua como cliente (React UI) e servidor backend (API Routes em `src/app/api`), mediando a comunicacao com o Supabase usando a Service Role Key.

---

## 2. Estrutura de Pastas

```text
Vistorias_imob/
├── scripts/                 # Scripts de automacao (keepalive, smoke-test, import)
├── src/
│   ├── app/
│   │   ├── layout.tsx       # Layout global (dark theme, TopNav, footer)
│   │   ├── globals.css      # Tema dark-only, variaveis CSS, overrides
│   │   ├── page.tsx         # Home - seletor de usuario
│   │   ├── admin/pessoas/   # Painel admin (CRUD pessoas, horarios de trabalho)
│   │   ├── api/             # API Routes (backend)
│   │   │   ├── inspections/ # CRUD vistorias + status + receive + reschedule + notify
│   │   │   ├── people/      # CRUD pessoas + schedule (horarios)
│   │   │   ├── calendar/    # Eventos para FullCalendar
│   │   │   ├── dashboard/   # Metricas e KPIs
│   │   │   ├── properties/  # Lookup de imoveis por codigo
│   │   │   ├── admin/       # Verificacao de PIN admin
│   │   │   └── keepalive/   # Cron para manter Supabase ativo
│   │   ├── calendario/      # Agenda semanal do vistoriador
│   │   ├── dashboard/       # Dashboard de metricas e graficos
│   │   ├── pessoas/         # Diretorio publico de pessoas
│   │   └── vistorias/       # Tela principal (kanban + lista + CRUD)
│   ├── components/          # Button, Modal, StatusBadge, TopNav
│   ├── hooks/               # useActor (sessao), useTheme
│   └── lib/                 # Utilitarios (API, validacao, WhatsApp, etc.)
├── supabase/
│   ├── schema.sql           # Schema completo do banco
│   └── *.sql                # Migracoes incrementais
├── public/                  # Arquivos estaticos
├── package.json
├── vercel.json              # Cron jobs
└── DOCUMENTACAO.md          # Este arquivo
```

---

## 3. Papeis e Permissoes

O sistema nao possui login com email/senha. O usuario seleciona seu perfil na tela inicial e o ID e salvo no localStorage.

| Papel | Codigo | Permissoes |
|-------|--------|------------|
| **Gestora** | `manager` | Criar/editar/deletar vistorias, atribuir vistoriador, cancelar, finalizar, ver todas as vistorias |
| **Atendente** | `attendant` | Mesmas permissoes da gestora (criar, editar, atribuir) |
| **Vistoriador** | `inspector` | Receber/agendar vistorias atribuidas, iniciar, concluir, reagendar, devolver para nova e excluir vistoria atribuida em status new/canceled |

Acoes administrativas (CRUD de pessoas, horarios) exigem `ADMIN_PIN`.

---

## 4. Fluxo de Status das Vistorias

```
Nova (new)
  ↓ vistoriador recebe e agenda
Recebida (received)
  ↓ vistoriador inicia
Em andamento (in_progress)
  ├→ Sem Contrato (awaiting_contract) — aguardando documentacao
  │   ├→ Em andamento (retoma)
  │   └→ Concluida
  └→ Concluida (completed)
       ↓ gestora finaliza
       Finalizada (finalized)

Cancelada (canceled) — gestora pode cancelar de qualquer status
Devolver p/ Nova — vistoriador ou gestora devolve de received/in_progress para new
```

**Ao devolver para Nova:**
- `scheduled_start`, `scheduled_end`, `duration_minutes` sao zerados
- `received_at` e `completed_at` sao zerados
- O prazo reinicia automaticamente (baseado em `received_at`)

---

## 5. Logica de Prazos

| Tipo | Base do Prazo | Comportamento |
|------|---------------|---------------|
| **Ocupacao** | `contract_date` (data fixa do contrato) | Sempre conta, independente do status |
| **Desocupacao** | `received_at` + 3 dias uteis | So conta apos vistoriador receber |
| **Revistoria, Visita, Placa/Fotos** | `contract_date` (se informada) | So conta apos vistoriador receber |

**Badges de prazo:**
- **Aguardando recebimento** (amarelo/ambar) — vistoria em "Nova", vistoriador ainda nao recebeu
- **Prazo [dia]** (verde) — dentro do prazo
- **Prazo Amanha** (laranja) — vence amanha
- **Prazo Hoje** (ambar) — vence hoje
- **Atrasada X dia(s)** (vermelho) — prazo vencido
- **Encerrada** (cinza) — finalizada ou cancelada
- **Concluida (pendente de finalizacao)** (ambar) — aguardando gestora finalizar

---

## 6. API Routes

### Vistorias (`/api/inspections`)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/inspections` | GET | Listar vistorias (filtros: assigned_to, created_by, status, mes/ano) |
| `/api/inspections` | POST | Criar vistoria (gestora/atendente). Auto-upsert catalogo de imoveis |
| `/api/inspections/[id]` | PATCH | Editar vistoria (somente criador, antes de finalizar) |
| `/api/inspections/[id]` | DELETE | Deletar vistoria (criador ou vistoriador atribuido, somente status new/canceled) |
| `/api/inspections/[id]/status` | POST | Mudar status. Dispara notificacao WhatsApp. Registra evento de auditoria |
| `/api/inspections/[id]/receive` | POST | Vistoriador recebe e agenda. Valida horario comercial + conflitos |
| `/api/inspections/[id]/reschedule` | POST | Reagendar vistoria recebida/em andamento |
| `/api/inspections/[id]/notify` | POST | Disparar notificacao WhatsApp manualmente |

### Pessoas (`/api/people`)

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/people` | GET | Listar pessoas (filtros: active, role) |
| `/api/people` | POST | Criar pessoa (requer ADMIN_PIN) |
| `/api/people/[id]` | GET | Buscar pessoa por ID |
| `/api/people/[id]` | PATCH | Editar pessoa (requer ADMIN_PIN) |
| `/api/people/[id]/schedule` | GET | Buscar horario de trabalho do vistoriador |
| `/api/people/[id]/schedule` | PATCH | Definir horario customizado (requer ADMIN_PIN) |

### Outros

| Rota | Metodo | Descricao |
|------|--------|-----------|
| `/api/calendar` | GET | Eventos para FullCalendar (filtros: assigned_to, range) |
| `/api/dashboard/metrics` | GET | KPIs, evolucao diaria, ranking, breakdown por tipo/cidade/status |
| `/api/properties/lookup` | GET | Buscar imovel por codigo (auto-complete no formulario) |
| `/api/admin/verify` | POST | Verificar ADMIN_PIN |
| `/api/keepalive` | GET | Cron: ping Supabase + auto-restore se inativo |

---

## 7. Banco de Dados (Supabase PostgreSQL)

### Tabelas Principais

**people**
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| name | text | Nome |
| phone | text (nullable) | WhatsApp (formato E.164) |
| role | enum | manager, inspector, attendant |
| active | boolean | Ativo/inativo |
| created_at | timestamptz | Data de criacao |

**inspections**
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| created_at, updated_at | timestamptz | Timestamps |
| created_by | uuid (FK people) | Quem criou |
| assigned_to | uuid (FK people) | Vistoriador atribuido |
| type | enum | ocupacao, desocupacao, revistoria, visita, placa_fotos |
| status | enum | new, received, in_progress, completed, awaiting_contract, finalized, canceled |
| property_code | text | Codigo do imovel |
| property_address | text | Endereco completo |
| property_street, property_number, property_complement, property_neighborhood, property_city | text (nullable) | Endereco estruturado |
| contract_date | timestamptz (nullable) | Data do contrato |
| notes | text (nullable) | Observacoes |
| scheduled_start, scheduled_end | timestamptz (nullable) | Agendamento |
| duration_minutes | int (nullable) | Duracao em minutos |
| received_at | timestamptz (nullable) | Quando foi recebida pelo vistoriador |
| completed_at | timestamptz (nullable) | Quando foi concluida |

**properties** (catalogo de imoveis)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| code | text | Codigo original |
| code_normalized | text (unique) | Codigo normalizado para busca |
| address, property_street, etc. | text | Dados do imovel |

**inspection_status_events** (auditoria)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| id | uuid (PK) | Identificador |
| inspection_id | uuid (FK) | Vistoria |
| from_status, to_status | enum | Transicao |
| changed_by | uuid (FK people) | Quem mudou |
| changed_at | timestamptz | Quando |

**work_schedules** (horarios customizados)
| Coluna | Tipo | Descricao |
|--------|------|-----------|
| person_id | uuid (PK, FK people) | Vistoriador |
| work_start, work_start_min | smallint | Hora/minuto de entrada |
| lunch_start, lunch_start_min | smallint | Inicio almoco |
| lunch_end, lunch_end_min | smallint | Fim almoco |
| work_end, work_end_min | smallint | Hora/minuto de saida |

### Cidades Suportadas
- Taquara
- Parobe
- Igrejinha

---

## 8. Horarios de Trabalho e Agendamento

**Padrao:** 08:00-12:00 (manha) + 13:00-18:00 (tarde)

Cada vistoriador pode ter horario customizado (configurado no painel admin). O sistema:
- Valida se o slot esta dentro do horario comercial
- Detecta conflitos com outras vistorias do mesmo vistoriador
- Sugere proximo horario disponivel em caso de conflito
- Pula finais de semana (dias uteis apenas)
- Intervalos de 30 minutos

---

## 9. Notificacoes WhatsApp

**Providers suportados:**
- `webhook` — envia POST para URL configurada
- `meta` — Meta Cloud API (graph.facebook.com)

**Eventos que disparam notificacao:**
| Evento | Destinatario | Quando |
|--------|-------------|--------|
| inspection_assigned_to_inspector | Vistoriador | Nova vistoria atribuida |
| inspection_scheduled | Solicitante (gestora) | Vistoriador agendou |
| inspection_completed | Solicitante (gestora) | Vistoriador concluiu |

**Formato das mensagens:** Texto simples com negrito WhatsApp (*bold*), sem emojis (compatibilidade de encoding).

---

## 10. Dashboard e KPIs

**Metricas disponíveis:**
- Vistorias criadas no periodo
- Vistorias em aberto operacionais (nova, recebida, em andamento e sem contrato)
- Vistorias concluidas
- Vistorias finalizadas no dashboard (concluidas + finalizadas)
- Vistorias canceladas
- Atrasadas (prazo vencido)
- SLA % (concluidas no prazo / com prazo)
- Tempo medio de conclusao (horas)

**Graficos:**
- Evolucao diaria (linha com area)
- Distribuicao por tipo (barras)
- Distribuicao por status (barras)
- Distribuicao por cidade (pizza)
- Ranking de gestoras (top 10)
- Ranking de vistoriadores (top 10)

**Filtros:** Periodo, gestora, vistoriador, tipo, status, cidade.

**Exportacao:** PDF com graficos e tabelas.

---

## 11. Tema Visual

Tema dark-only (sem alternancia claro/escuro).

**Variaveis CSS principais:**
| Variavel | Valor | Uso |
|----------|-------|-----|
| --background | #0c1830 | Fundo geral |
| --foreground | #e2ecff | Texto principal |
| --muted | #90aace | Texto secundario |
| --card | #152340 | Fundo de cards |
| --card-soft | #1c2e50 | Cards alternativo |
| --accent | #4f8ef7 | Links e destaques |
| --accent-strong | #74acff | Hover de links |
| --danger | #f87171 | Erros e alertas |

**Status badges** usam cores vibrantes com inline styles (RGBA) para compatibilidade com o tema dark.

---

## 12. Componentes Reutilizaveis

| Componente | Arquivo | Descricao |
|------------|---------|-----------|
| Button | `src/components/Button.tsx` | Botao com variantes (primary, secondary) e tamanhos (sm, default) |
| Modal | `src/components/Modal.tsx` | Dialog modal com overlay |
| StatusBadge | `src/components/StatusBadge.tsx` | Badge de status com cores inline (dark-friendly) |
| TopNav | `src/components/TopNav.tsx` | Barra de navegacao com logo, links, seletor de usuario, responsivo |

---

## 13. Bibliotecas Utilitarias (`src/lib/`)

| Arquivo | Descricao |
|---------|-----------|
| `actor.ts` | Validacao de sessao no servidor (getActor, requireActor) |
| `adminPin.ts` | Verificacao de ADMIN_PIN para rotas protegidas |
| `apiResponse.ts` | Helpers de resposta JSON com no-cache |
| `businessTime.ts` | Validacao de horario comercial e slots |
| `clientApi.ts` | Wrapper de fetch no cliente com headers de autenticacao |
| `errors.ts` | Classe HttpError para erros de API |
| `inspectionStatusEvent.ts` | Registro de transicoes de status (auditoria) |
| `labels.ts` | Labels de tipos e status com emojis |
| `phone.ts` | Normalizacao de telefone (formato E.164) |
| `property.ts` | Normalizacao de codigo, composicao de endereco, deteccao de cidade |
| `supabaseAdmin.ts` | Cliente Supabase server-side (service role) |
| `suggest.ts` | Algoritmo de sugestao de proximo horario disponivel |
| `whatsapp.ts` | Integracao WhatsApp (webhook + Meta API) |
| `workSchedule.ts` | CRUD de horarios customizados de trabalho |

---

## 14. Variaveis de Ambiente

### Obrigatorias

| Variavel | Descricao |
|----------|-----------|
| `SUPABASE_URL` | URL da API do Supabase |
| `NEXT_PUBLIC_SUPABASE_URL` | URL publica do Supabase (exposta ao cliente) |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave server-side do Supabase |
| `ADMIN_PIN` | PIN para operacoes administrativas |
| `CRON_SECRET` | Secret para autorizacao do cron keepalive |

### Supabase Keepalive

| Variavel | Descricao |
|----------|-----------|
| `SUPABASE_PROJECT_REF` | Referencia do projeto (inferido da URL se ausente) |
| `SUPABASE_ACCESS_TOKEN` | Token para Management API (restore) |
| `SUPABASE_KEEPALIVE_TABLE` | Tabela para ping (default: people) |
| `SUPABASE_AUTO_RESTORE` | 1 para habilitar auto-restore |

### WhatsApp (Opcional)

| Variavel | Descricao |
|----------|-----------|
| `WHATSAPP_NOTIFICATIONS_ENABLED` | 0 ou 1 |
| `WHATSAPP_PROVIDER` | webhook ou meta |
| `WHATSAPP_DEFAULT_COUNTRY_CODE` | 55 (Brasil) |
| `WHATSAPP_TIMEZONE` | America/Sao_Paulo |
| `WHATSAPP_NOTIFY_EXTRA_TO` | Destinatarios extras (virgula) |
| `WHATSAPP_WEBHOOK_URL` | URL do webhook |
| `WHATSAPP_WEBHOOK_TOKEN` | Token opcional |
| `WHATSAPP_META_API_VERSION` | v22.0 |
| `WHATSAPP_META_PHONE_NUMBER_ID` | ID do numero WhatsApp |
| `WHATSAPP_META_ACCESS_TOKEN` | Token da Meta API |

---

## 15. Deploy e Versionamento

### Git

```bash
git add <arquivos>
git commit -m "descricao da mudanca"
git push origin main
```

O repositorio esta em: GitHub (`leotaq/visto_new`)

### Vercel

Deploy automatico via webhook do GitHub. Ao fazer `git push origin main`:
1. Vercel detecta o push
2. Clona, instala dependencias, compila (`next build`)
3. Injeta variaveis de ambiente configuradas no painel
4. Publica na URL: **https://visto-new.vercel.app**

**Cron Job** (definido em `vercel.json`):
- Rota: `/api/keepalive`
- Horario: 04:17 UTC diariamente
- Proposito: Manter Supabase ativo no plano gratuito

### Deploy manual (se necessario)

```bash
npx vercel --prod
```

---

## 16. Scripts de Automacao

| Script | Descricao |
|--------|-----------|
| `scripts/supabase-keepalive.mjs` | Ping manual no Supabase + relatorio de status |
| `scripts/supabase-restore-project.mjs` | Restaurar projeto Supabase manualmente |
| `scripts/import-properties.mjs` | Importar imoveis em massa via CSV |
| `scripts/smoke-test.ps1` | Teste de integracao automatizado |
| `scripts/start-dev.ps1` | Iniciar servidor de desenvolvimento |

---

## 17. Consideracoes para Integracao

Ao integrar este sistema em um sistema maior, considerar:

1. **Autenticacao:** O sistema atual nao tem login real. Para integracao, implementar autenticacao adequada (JWT, OAuth) substituindo o mecanismo de actor por localStorage.

2. **API como microservico:** Todas as rotas em `/api/*` podem ser consumidas externamente via HTTP. O header `x-actor-id` identifica o usuario.

3. **Banco de dados:** O schema Supabase pode ser migrado para qualquer PostgreSQL. As migracoes estao em `supabase/*.sql`.

4. **Notificacoes:** O sistema de WhatsApp e desacoplado (webhook generico). Pode ser substituido por qualquer sistema de mensageria.

5. **Tema:** O CSS usa variaveis customizadas (`--background`, `--card`, etc.) que podem ser sobrescritas para integrar com outro design system.

6. **Dependencias externas:** Supabase (banco), Vercel (deploy), WhatsApp (notificacoes) — todos substituiveis.

---

*Sistema desenvolvido por Leo Antunes — WhatsApp: 51 99717-4866*
