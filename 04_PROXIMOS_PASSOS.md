# Proximos Passos

## Backlog em ordem recomendada
1. Introduzir uma camada de variante/ambiente para diferenciar legado e beta.
2. Configurar o novo projeto Supabase beta e o novo projeto Vercel beta.
3. Integrar Supabase Auth com Google Login na beta.
4. Criar o fluxo de pedido de acesso pendente e aprovacao manual.
5. Mapear a sessao autenticada para uma pessoa do sistema.
6. Adaptar o fluxo de ator da beta para nao depender de `X-Actor-Id` como origem principal.
7. Criar as tabelas de Google Calendar e o servico de sincronizacao.
8. Sincronizar agendamentos de vistoriadores com Google Calendar.
9. Criar rotina de refresh da producao para a beta preservando tabelas especificas da beta.
10. Cobrir tudo com testes unitarios, integrados e E2E.

## Primeiro corte tecnico recomendado
O primeiro corte deve ser pequeno e seguro:
- criar `APP_VARIANT=legacy|beta`
- manter o legado com comportamento identico
- na beta, trocar a entrada da aplicacao para exigir sessao Google
- se o usuario ainda nao estiver aprovado, mostrar tela de acesso pendente

Esse corte ja prova a espinha dorsal sem depender do Calendar.

## Checklist para abrir a nova workspace e comecar
1. Abrir esta pasta em uma nova janela.
2. Ler `00_START_HERE.md` ate `09_CHECKLIST_INFRA_BETA.md`.
3. Revisar os arquivos centrais do legado indicados em `03_MAPA_DE_REUSO.md`.
4. Usar `08_BANCO_BETA.md` para listar as migrations que precisam ser criadas.
5. Usar `09_CHECKLIST_INFRA_BETA.md` para reunir todos os dados de Supabase, Google e Vercel.
6. Configurar um novo `.env.local` proprio da beta.
7. Apontar o projeto para um Supabase beta separado.
8. Instalar dependencias e validar `npm run build`.
9. Comecar pelo corte tecnico de autenticacao.

## Sequencia sugerida de implementacao

### Fase 1 - Esqueleto beta
- introduzir a nocao de variante
- criar camada de sessao Supabase Auth
- adicionar tela de login Google
- adicionar tela de pendencia de aprovacao

### Fase 2 - Vinculo de usuarios
- criar tabelas de pedidos e vinculos
- criar painel admin para aprovar acesso
- mapear usuario autenticado para `people`

### Fase 3 - Google Calendar
- criar integracao OAuth por vistoriador
- guardar tokens e mapeamento de eventos
- sincronizar create/update/delete de compromissos

### Fase 4 - Operacao beta
- criar rotina de refresh frequente da producao
- preservar dados beta
- endurecer testes e observabilidade

## Risco principal a evitar
Nao misturar implementacao de Google Login e Google Calendar antes de a camada de identidade estar fechada. Primeiro resolver quem e o usuario; depois integrar a agenda externa.
