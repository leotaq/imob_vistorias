# AGENTS.md

## Objetivo
Esta workspace existe para virar a base da beta com Google Login e Google Calendar, sem mexer no sistema legado em producao.
Qualquer IA que abrir esta pasta deve conseguir continuar o projeto apenas lendo os documentos locais.

## Contexto inicial da beta
- Origem da copia: `C:\Users\Usuario\Documents\Vistorias_imob`
- Pasta seed: `C:\Users\Usuario\Documents\Vistorias_imob_beta_seed`
- Repositorio Git da beta: `https://github.com/leotaq/imob_vistorias`
- Data do snapshot: `2026-03-24 20:41 UTC-03`
- Objetivo da nova workspace: reaproveitar o sistema atual como semente do novo produto beta, com autenticacao real e integracao por usuario com Google Calendar.
- Leitura inicial obrigatoria:
  1. `00_START_HERE.md`
  2. `01_ESTADO_ATUAL.md`
  3. `02_PROJETO_BETA.md`
  4. `03_MAPA_DE_REUSO.md`
  5. `04_PROXIMOS_PASSOS.md`
  6. `05_AMBIENTES_E_SECRETS.md`
  7. `06_DECISOES_FECHADAS_2026-03-24.md`
  8. `07_CRITERIOS_DE_ACEITE.md`
  9. `08_BANCO_BETA.md`
  10. `09_CHECKLIST_INFRA_BETA.md`
  11. `10_COPIA_E_REFRESH_BANCO.md`

## Regras de uso para qualquer IA
1. Leia os documentos na ordem acima antes de alterar codigo, SQL, scripts ou docs.
2. Nao assuma que a arquitetura antiga pode ir para a beta sem adaptacoes; confira o mapa de reuso.
3. Nao publique nada da beta no projeto Vercel atual do sistema legado.
4. Nao copie segredos da producao para esta pasta.
5. Sempre registre no topo deste arquivo o que foi realmente feito.
6. Quando uma decisao mudar, atualize tambem o documento tematico correspondente.
7. Se desfizer uma escolha anterior, diga explicitamente o que mudou e por que.

## Template de entrada
Copie este bloco e preencha:

### [AAAA-MM-DD HH:MM UTC-03] [Nome da IA]
Objetivo:
- O que esta alteracao tentou resolver.

Arquivos alterados:
- caminho/do/arquivo

Resumo do que foi feito:
- Mudanca 1.
- Mudanca 2.

Decisoes importantes:
- Escolhas tecnicas, limites ou defaults adotados.

Pendencias / riscos:
- O que ainda falta, pontos de atencao ou impactos possiveis.

Como validar:
- Comando, tela ou fluxo usado para verificar a mudanca.

## Registro compartilhado de alteracoes

### [2026-03-24 21:39 UTC-03] Codex (GPT-5)
Objetivo:
- Gravar o estado atual da beta no repositrio `https://github.com/leotaq/imob_vistorias`.

Arquivos alterados:
- .gitignore
- AGENTS.md

Resumo do que foi feito:
- Alinhada a branch local `main` com `origin/main`, que tinha apenas um `Initial commit`.
- Ajustado o `.gitignore` para versionar `.env.beta.example`.
- Preparado o snapshot atual da beta para ser commitado e enviado ao remoto.

Decisoes importantes:
- O repositrio remoto da beta passa a ser a origem oficial desta workspace.
- `.env.beta.example` fica versionado porque faz parte do bootstrap do ambiente beta.

Pendencias / riscos:
- O push depende das credenciais Git locais funcionarem nesta maquina.

Como validar:
- Executar `git status --short --ignored`.
- Confirmar `.env.beta.example` como arquivo normal, nao ignorado.
- Executar `git push origin main` para subir o snapshot.

### [2026-03-24 21:33 UTC-03] Codex (GPT-5)
Objetivo:
- Deixar o repositorio Git da beta salvo no proprio seed, sem alterar o remoto do legado.

Arquivos alterados:
- AGENTS.md
- 00_START_HERE.md

Resumo do que foi feito:
- Inicializado Git em `C:\Users\Usuario\Documents\Vistorias_imob_beta_seed`.
- Configurado `origin` para `https://github.com/leotaq/imob_vistorias`.
- Registrado o remoto da beta na documentacao principal da seed.

Decisoes importantes:
- O repositrio do legado nao foi alterado.
- A seed passa a abrir ja com o remoto correto da beta configurado.

Pendencias / riscos:
- Ainda nao houve commit nem push desta seed para o remoto novo.
- Se o repositrio remoto ja tiver historico proprio, a primeira sincronizacao vai exigir revisao antes do push.

Como validar:
- Executar `git -C C:\Users\Usuario\Documents\Vistorias_imob_beta_seed remote -v`.
- Confirmar `origin` apontando para `https://github.com/leotaq/imob_vistorias`.

### [2026-03-24 21:29 UTC-03] Codex (GPT-5)
Objetivo:
- Iniciar a implementacao real da beta com Google Login, acesso pendente, aprovacao administrativa e base de banco para auth/calendar.

Arquivos alterados:
- package.json
- package-lock.json
- src/lib/appVariant.ts
- src/lib/supabaseAuthShared.ts
- src/lib/supabaseBrowser.ts
- src/lib/supabaseServer.ts
- src/lib/authActor.ts
- src/lib/actor.ts
- src/hooks/useActor.ts
- src/proxy.ts
- src/app/page.tsx
- src/components/TopNav.tsx
- src/app/acesso-pendente/page.tsx
- src/app/auth/callback/route.ts
- src/app/api/auth/me/route.ts
- src/app/api/auth/access-requests/route.ts
- src/app/api/auth/access-requests/[id]/approve/route.ts
- src/app/api/people/route.ts
- src/app/dashboard/page.tsx
- src/app/calendario/page.tsx
- src/app/vistorias/page.tsx
- src/app/pessoas/page.tsx
- src/app/admin/pessoas/page.tsx
- src/app/api/people/[id]/schedule/route.ts
- supabase/migrations/20260324220000_add_beta_auth_and_calendar_tables.sql
- supabase/schema.sql

Resumo do que foi feito:
- Adicionada a infraestrutura de auth da Supabase para a beta, com cliente browser, cliente server e `proxy.ts` para manter sessao/cookies.
- Criado o fluxo de login Google da beta: home nova, callback em `/auth/callback`, rota `/api/auth/me` e tela `/acesso-pendente`.
- Implementada a resolucao central de `actor` para suportar sessao aprovada, acesso pendente e fallback administrativo com PIN.
- Criadas APIs e UI admin para listar pedidos de acesso pendentes e aprovar o vinculo de uma conta Google a uma pessoa existente.
- Criadas as tabelas/migration base da beta para `auth_access_requests`, `person_auth_links`, `person_google_calendar_links`, `inspection_google_calendar_events` e `google_oauth_states`.
- As telas principais passaram a redirecionar corretamente entre `/`, `/acesso-pendente` e as areas operacionais conforme o estado da sessao.
- A listagem de pessoas passou a exigir sessao aprovada ou PIN admin quando a app estiver em variante `beta`.

Decisoes importantes:
- O primeiro corte reutiliza o conceito de `actor` do legado para evitar reescrever todo o sistema agora, mas a origem do `actor` na beta passa a ser a sessao Google aprovada.
- O fallback de troca manual de usuario continua disponivel apenas quando existe `ADMIN_PIN` ativo na sessao, alinhado com a regra de admin/dev.
- O Google Calendar ainda nao foi implementado; apenas a base de banco e o esqueleto de auth ficaram prontos.

Pendencias / riscos:
- Para funcionar em runtime, a beta ainda precisa de `NEXT_PUBLIC_SUPABASE_ANON_KEY`, provider Google habilitado no Supabase beta e as migrations aplicadas.
- Ainda falta implementar a parte operacional de Google Calendar, criptografia de tokens e os scripts de copia/refresh de banco.
- O fluxo de aprovacao administrativa depende de pessoas existentes no banco beta; se o banco estiver vazio, sera preciso popular `people` primeiro.

Como validar:
- Executar `npx tsc --noEmit`.
- Executar `npx eslint src`.
- Executar `npm run build`.
- Com as envs e migrations aplicadas, testar: login Google -> `/acesso-pendente` -> aprovar em `/admin/pessoas` -> acessar `/vistorias`.

### [2026-03-24 21:24 UTC-03] Codex (GPT-5)
Objetivo:
- Explicar exatamente como a beta deve receber os dados do banco atual e como fazer refresh depois sem perder os dados proprios da beta.

Arquivos alterados:
- AGENTS.md
- .env.beta.example
- 05_AMBIENTES_E_SECRETS.md
- 09_CHECKLIST_INFRA_BETA.md
- 10_COPIA_E_REFRESH_BANCO.md

Resumo do que foi feito:
- Criado `10_COPIA_E_REFRESH_BANCO.md` com o procedimento da copia inicial e do refresh recorrente.
- Definida a estrategia de refresh por merge/upsert para preservar as tabelas proprias da beta.
- Criado `.env.beta.example` com todas as variaveis previstas para a app beta e para o fluxo de copia/refresh.
- Ajustados os docs de ambientes e checklist para apontarem para o novo procedimento.

Decisoes importantes:
- A copia inicial pode usar `Restore to new project` ou `supabase db dump` + `psql`.
- O refresh recorrente da beta nao deve sobrescrever as tabelas proprias de auth e Google Calendar.

Pendencias / riscos:
- O procedimento esta documentado, mas os scripts `beta-clone-initial` e `beta-refresh-from-source` ainda nao existem.
- A estrategia v1 de refresh nao apaga automaticamente vistorias ausentes na origem para reduzir risco de perda e de quebra nos mapeamentos do Calendar.

Como validar:
- Ler `10_COPIA_E_REFRESH_BANCO.md`.
- Conferir `.env.beta.example`.
- Confirmar que o documento responde como o banco novo recebe os dados do atual e como manter refreshes sem perder dados beta.

### [2026-03-24 21:05 UTC-03] Codex (GPT-5)
Objetivo:
- Deixar a seed da beta mais autonoma, explicando o banco novo, o setup de Supabase, Google e Vercel, e um checklist do que buscar/configurar.

Arquivos alterados:
- AGENTS.md
- 00_START_HERE.md
- 02_PROJETO_BETA.md
- 04_PROXIMOS_PASSOS.md
- 05_AMBIENTES_E_SECRETS.md
- 08_BANCO_BETA.md
- 09_CHECKLIST_INFRA_BETA.md

Resumo do que foi feito:
- Criados dois documentos novos com o desenho do banco beta e um checklist operacional de infraestrutura.
- Detalhadas as tabelas novas, colunas recomendadas, indices e fluxo esperado de auth e Google Calendar.
- Adicionado um inventario pratico de tudo que precisa ser buscado no Supabase, Google Cloud e Vercel antes da implementacao.

Decisoes importantes:
- O Google Login via Supabase Auth foi documentado como configuracao do projeto Supabase beta, nao como segredo da app.
- O Google Calendar foi documentado como OAuth separado, com tokens guardados pelo backend da beta.

Pendencias / riscos:
- Os documentos descrevem o baseline recomendado, mas as migrations e o codigo ainda nao foram implementados.
- Se a equipe decidir mudar o fluxo de OAuth do Calendar, o `08_BANCO_BETA.md` precisara ser revisado.

Como validar:
- Ler `08_BANCO_BETA.md` e `09_CHECKLIST_INFRA_BETA.md`.
- Confirmar que eles respondem o que criar no banco e quais valores precisam ser obtidos/configurados para Supabase, Google e Vercel.

### [2026-03-24 20:41 UTC-03] Codex (GPT-5)
Objetivo:
- Criar uma workspace seed independente para a beta com Google Login e Google Calendar, permitindo abrir outra janela de IA com contexto completo.

Arquivos alterados:
- AGENTS.md
- 00_START_HERE.md
- 01_ESTADO_ATUAL.md
- 02_PROJETO_BETA.md
- 03_MAPA_DE_REUSO.md
- 04_PROXIMOS_PASSOS.md
- 05_AMBIENTES_E_SECRETS.md
- 06_DECISOES_FECHADAS_2026-03-24.md
- 07_CRITERIOS_DE_ACEITE.md

Resumo do que foi feito:
- Copiada a base do projeto legado para esta pasta, sem `.git`, `.env.local`, `.vercel`, `.next` nem `node_modules`.
- Copiado tambem o `.gitignore` do projeto original para a seed.
- Criado um pacote de handoff completo para outra IA entender o estado atual, o desenho da beta e o proximo passo de implementacao.
- Registradas as decisoes fechadas em 2026-03-24 para evitar perda de contexto ao trocar de workspace.
- Validado `npm ci` e `npm run build` nesta pasta; os artefatos gerados foram movidos para fora da seed para mantela limpa.

Decisoes importantes:
- Esta pasta e um seed de desenvolvimento, nao um deploy e nem um fork publicado.
- O sistema legado continua sendo a referencia operacional e a beta deve seguir isolada em outro projeto Vercel e outro projeto Supabase.

Pendencias / riscos:
- Google Login, Google Calendar, refresh de dados e testes ainda nao foram implementados nesta workspace.
- Antes de iniciar a implementacao, sera preciso configurar um novo ambiente beta com credenciais proprias.

Como validar:
- Ler `00_START_HERE.md` ate `07_CRITERIOS_DE_ACEITE.md`.
- Abrir esta pasta em outra janela e confirmar que o contexto da beta esta autocontido.
- Executar `npm ci` e `npm run build` com um `.env.local` proprio, se quiser repetir a validacao tecnica.
