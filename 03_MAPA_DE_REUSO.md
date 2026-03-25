# Mapa de Reuso

## O que deve ser reaproveitado quase como esta
- dominio de negocio de vistorias, tipos e status
- telas operacionais de vistorias, calendario e dashboard como base visual
- rotas e servicos de negocio que nao dependem diretamente do modelo antigo de ator
- schema atual como base para `people`, `properties`, `inspections` e historico de status
- scripts e documentacao do legado como referencia operacional

## O que deve ser adaptado na beta
- modelo de identidade
  - hoje depende de `localStorage` e `X-Actor-Id`
  - na beta deve depender de sessao autenticada
- tabela `people`
  - precisa conviver com um vinculo de auth externo
  - pode ganhar apoio indireto por nova tabela de links, sem acoplar tudo direto nela no primeiro passo
- calendario
  - continua existindo internamente
  - ganha camada de sincronizacao com Google para vistoriadores
- area admin
  - precisa aprovar pedidos de acesso e vincular contas Google

## O que nao deve ser copiado conceitualmente para a beta
- seletor manual de pessoa como mecanismo principal de acesso
- confianca em `X-Actor-Id` vindo do navegador para identificar usuario comum
- deploy da beta no mesmo projeto Vercel da producao
- tentativa de usar o mesmo projeto Supabase para legado e beta com OAuth compartilhado

## Arquivos de referencia principais

### `src/hooks/useActor.ts`
Uso no legado:
- mantem o ator no `localStorage`
- serve para troca manual de usuario

Na beta:
- usar apenas como referencia do que esta sendo substituido
- nao deve continuar como origem principal da identidade do usuario comum

### `src/lib/clientApi.ts`
Uso no legado:
- injeta `X-Actor-Id` e `X-Admin-Pin`

Na beta:
- precisa evoluir para conviver com sessao autenticada
- `X-Actor-Id` deve sair do fluxo principal do usuario comum

### `src/lib/actor.ts`
Uso no legado:
- resolve o ator a partir do header recebido

Na beta:
- deve ganhar um caminho novo baseado na sessao autenticada
- pode manter compatibilidade temporaria para admin/dev

### `src/app/calendario/page.tsx`
Uso no legado:
- tela da agenda semanal interna

Na beta:
- continua como base da experiencia visual da agenda
- pode receber card/status da integracao Google por vistoriador

### `src/app/api/calendar/route.ts`
Uso no legado:
- lista eventos internos da agenda

Na beta:
- continua servindo os eventos internos
- deve coexistir com o servico de sincronizacao Google, nao ser substituida por ele

### `src/app/api/people/route.ts`
Uso no legado:
- lista e cria pessoas

Na beta:
- continua relevante para o cadastro base
- deve ganhar suporte indireto ao processo de aprovacao e vinculacao de auth

### `supabase/schema.sql`
Uso no legado:
- base do modelo de dados principal

Na beta:
- deve ser expandido com tabelas novas de auth e Google Calendar
- serve como ponto de partida, nao como schema final

## Regra pratica de implementacao
Ao construir a beta:
- preserve o que for dominio de negocio
- substitua o que for identidade e integracao
- evite reescrever tudo sem necessidade
