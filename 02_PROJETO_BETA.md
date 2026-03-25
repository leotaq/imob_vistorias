# Projeto Beta

## Visao
A beta sera uma evolucao do sistema atual com autenticacao real e integracao individual com Google, mas sem colocar o legado em risco.

Objetivos da beta:
- manter o dominio atual de vistorias
- adicionar Google Login para todos os perfis
- adicionar Google Calendar para vistoriadores
- preservar a clareza operacional do sistema atual
- testar a arquitetura nova em ambiente separado

## Isolamento da beta
A beta deve ser isolada em tres niveis:
- pasta/workspace propria
- projeto Vercel proprio
- projeto Supabase proprio

Decisao importante:
- mesma organization da Supabase pode ser usada
- o projeto Supabase nao deve ser o mesmo do legado, porque Auth, redirect URLs e configuracoes de OAuth sao por projeto

## Regras de autenticacao
- todos os usuarios comuns entram com Google Login
- o seletor manual de pessoa deixa de ser o fluxo principal
- o seletor antigo pode existir apenas como fallback para admin/dev
- o vinculo entre conta Google e pessoa do sistema sera por aprovacao manual

Fluxo desejado:
1. usuario entra com Google
2. se nao estiver vinculado, gera pedido pendente
3. admin aprova e liga a conta Google a uma pessoa existente
4. a partir dai o usuario opera como aquela pessoa

## Google Calendar
Escopo aprovado:
- somente vistoriadores na v1 beta
- sincronizacao inicial apenas `sistema -> Google`
- o sistema continua sendo a fonte oficial da agenda

Eventos que devem sincronizar:
- receber/agendar vistoria
- reagendar
- trocar vistoriador
- cancelar
- excluir
- remover horario/agendamento

Falha de sync:
- nunca pode bloquear o fluxo principal da vistoria
- deve ficar registrada para reprocessamento e suporte

## Refresh de dados
Decisoes aprovadas:
- a beta recebera refresh frequente da producao
- os dados de negocio podem ser atualizados com dados reais
- os dados especificos da beta devem ser preservados entre refreshes

Dados beta a preservar:
- pedidos de acesso
- aprovacoes/vinculos de login
- vinculacoes de Google Calendar
- mapeamento de eventos sincronizados

## Estruturas novas previstas para a beta
Tabelas sugeridas:
- `auth_access_requests`
- `person_auth_links`
- `person_google_calendar_links`
- `inspection_google_calendar_events`
- `google_oauth_states`

Objetivo de cada uma:
- guardar quem pediu acesso via Google
- ligar um usuario autenticado a uma pessoa interna
- guardar tokens/configuracao da agenda Google por vistoriador
- mapear eventos do sistema para eventos do Google Calendar
- validar o callback do OAuth do Google Calendar contra replay ou uso indevido

Detalhamento pratico:
- o desenho recomendado dessas tabelas esta em `08_BANCO_BETA.md`
- o setup operacional para Supabase, Google e Vercel esta em `09_CHECKLIST_INFRA_BETA.md`

## O que a beta nao deve fazer neste primeiro ciclo
- nao fazer sync em duas vias com Google Calendar
- nao substituir a producao atual
- nao compartilhar o mesmo projeto Supabase do legado
- nao depender do seletor manual de pessoa como autenticacao principal

## Resultado esperado
Ao final da beta, o time deve conseguir validar:
- login Google real por usuario
- aprovacao administrativa de acesso
- agenda Google por vistoriador funcionando
- legado intacto e sem regressao
