# Start Here

## O que e esta pasta
Esta pasta e uma copia-base do sistema atual de vistorias, preparada para virar a beta com:
- Google Login para todos os perfis
- Google Calendar por usuario para vistoriadores
- isolamento total em relacao ao sistema legado

Ela existe para que outra IA ou outro workspace possam continuar o projeto sem depender do historico desta conversa.

## Snapshot congelado
- Origem: `C:\Users\Usuario\Documents\Vistorias_imob`
- Repositorio Git da beta: `https://github.com/leotaq/imob_vistorias`
- Snapshot: `2026-03-24 20:41 UTC-03`
- Estado do legado nesse momento:
  - sistema em producao em `https://visto-new.vercel.app`
  - sem login real por usuario
  - identificacao atual via `localStorage` + header `X-Actor-Id`
  - admin protegido por `ADMIN_PIN`

## O que ja esta decidido para a beta
- Nao criar um sistema do zero.
- Reaproveitar este codigo como semente.
- Manter o legado intacto e criar a beta separada.
- Beta com outro projeto Vercel e outro projeto Supabase, na mesma organization da Supabase.
- Google Login para todos os perfis.
- Fluxo principal da beta sem seletor manual de pessoa.
- Fallback do seletor antigo apenas para admin/dev.
- Google Calendar apenas para vistoriadores.
- Sincronizacao inicial apenas `sistema -> Google`.
- Vinculo de conta Google a pessoa existente por aprovacao manual.
- Refresh frequente da producao para a beta, preservando dados especificos da beta.
- Dados reais na beta.

## Ordem de leitura recomendada
1. `01_ESTADO_ATUAL.md`
2. `02_PROJETO_BETA.md`
3. `03_MAPA_DE_REUSO.md`
4. `04_PROXIMOS_PASSOS.md`
5. `05_AMBIENTES_E_SECRETS.md`
6. `06_DECISOES_FECHADAS_2026-03-24.md`
7. `07_CRITERIOS_DE_ACEITE.md`
8. `08_BANCO_BETA.md`
9. `09_CHECKLIST_INFRA_BETA.md`
10. `10_COPIA_E_REFRESH_BANCO.md`

## Leitura tecnica rapida
Se a nova IA precisar achar rapido os pontos centrais do legado:
- `src/hooks/useActor.ts`
- `src/lib/clientApi.ts`
- `src/lib/actor.ts`
- `src/app/calendario/page.tsx`
- `src/app/api/calendar/route.ts`
- `src/app/api/people/route.ts`
- `supabase/schema.sql`

## Onde a proxima IA deve continuar
O proximo passo recomendado e implementar o esqueleto da beta em cortes pequenos:
1. criar a separacao por variante/ambiente
2. integrar Supabase Auth com Google Login
3. criar o fluxo de aprovacao manual de contas
4. substituir o modelo atual de ator na beta
5. implementar Google Calendar apenas para vistoriadores

Antes de escrever codigo:
- revisar `08_BANCO_BETA.md` para saber o que precisa virar migration
- revisar `09_CHECKLIST_INFRA_BETA.md` para reunir todas as infos e credenciais do ambiente beta
- revisar `10_COPIA_E_REFRESH_BANCO.md` para saber como a beta vai receber os dados do banco atual

## Regra de ouro
Nao usar esta pasta para substituir o deploy do legado. A beta deve nascer isolada e so depois, se validada, podera inspirar uma migracao controlada.

## Git da beta
- repositorio remoto configurado: `https://github.com/leotaq/imob_vistorias`
- pasta local com Git proprio: `C:\Users\Usuario\Documents\Vistorias_imob_beta_seed`
- antes do primeiro push, conferir se o remoto esta vazio ou se ja possui historico
