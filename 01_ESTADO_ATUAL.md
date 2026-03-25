# Estado Atual do Sistema Legado

## Resumo funcional
O sistema atual e uma aplicacao web para gestao de vistorias com:
- cadastro de pessoas
- criacao e acompanhamento de vistorias
- agenda semanal por vistoriador
- dashboard operacional
- notificacoes opcionais por WhatsApp

Fluxos principais:
- gestora cria vistoria
- vistoriador recebe, agenda e atualiza status
- agenda semanal exibe compromissos internos
- dashboard consolida indicadores operacionais

## Stack atual
- Next.js 16 + TypeScript + App Router
- React 19
- Tailwind CSS
- Supabase Postgres
- Sem Supabase Auth no fluxo principal
- FullCalendar para agenda

## Arquitetura de identidade atual
O sistema nao tem login real por usuario.

Como funciona hoje:
- o usuario escolhe uma pessoa na interface inicial
- `src/hooks/useActor.ts` grava `actorPersonId`, `actorName` e `actorRole` no `localStorage`
- `src/lib/clientApi.ts` envia `X-Actor-Id` em cada request
- `src/lib/actor.ts` le esse header, busca a pessoa na tabela `people` e usa isso como ator da operacao
- a area administrativa usa `ADMIN_PIN` via header `X-Admin-Pin`

Consequencia:
- esse modelo funciona para o MVP interno
- ele nao e seguro o suficiente para Google Login e Google Calendar por usuario sem uma camada nova de autenticacao

## Modelo de dados atual
Tabelas principais em `supabase/schema.sql`:
- `people`
- `properties`
- `inspections`
- `inspection_status_events`

Pontos importantes:
- `people` nao possui email nem vinculacao com auth
- `inspections` guarda criador, responsavel, agendamento e historico de status
- conflitos de horario do vistoriador sao bloqueados por constraint no banco

## Agenda atual
Agenda interna:
- tela: `src/app/calendario/page.tsx`
- API: `src/app/api/calendar/route.ts`

Comportamento atual:
- vistoriador e marketing veem a propria agenda
- gestora/atendente escolhem o vistoriador no filtro
- eventos vem apenas do banco interno
- nao existe integracao com Google Calendar

## Deploy atual em producao
- URL ativa conhecida em 2026-03-24: `https://visto-new.vercel.app`
- o legado continua sendo a referencia operacional
- a beta nao deve ser publicada sobre esse projeto

## Limitacoes que motivaram a beta
- sem login real por usuario
- sem vinculo confiavel entre pessoa e identidade externa
- sem integracao por usuario com Google Calendar
- dificil auditar quem realmente acessou o sistema
- arriscado acoplar Google OAuth diretamente ao modelo atual baseado em seletor manual

## Mudancas recentes ja feitas no legado
Registradas no `AGENTS.md` original do projeto atual:
- permissao de exclusao de vistoria para gestora autora, atendente e vistoriador atribuido, limitada a `new` e `canceled`
- dashboard passou a tratar `completed` como encerrada para efeito analitico
- removido o quadro azul destacado do dashboard
- prazo das vistorias de `ocupacao` passou a aparecer visualmente nos cards
- deploy em producao feito em `2026-03-24`

## Conclusao pratica
O legado esta funcional e deve permanecer estavel.
A nova beta nao nasce para substituir tudo de uma vez, mas para introduzir autenticacao real e integracao com Google de forma isolada e testavel.
