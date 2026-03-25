# Tutorial para Gestoras - Sistema de Gestao de Vistorias

Este tutorial ensina passo a passo como utilizar o sistema de vistorias, desde o acesso ate o acompanhamento completo de uma vistoria.

---

## 1. Acessando o Sistema

Abra o navegador (Google Chrome, Edge, etc.) e acesse o endereco do sistema:

**https://visto-new.vercel.app**

Voce vera a tela inicial com a lista de usuarios cadastrados, separados por papel:
- **Gestoras** (cor amarela)
- **Vistoriadores** (cor azul)
- **Atendentes** (cor roxa)

> [PRINT] - Tela inicial com lista de usuarios
---

## 2. Selecionando seu Perfil

Clique no seu nome na lista de gestoras. Ao clicar, voce sera redirecionada automaticamente para a tela principal de vistorias.

**Importante:** O sistema salva seu perfil no navegador. Na proxima vez que acessar, voce ja estara logada automaticamente. Para trocar de perfil, clique no seu nome no canto superior direito e selecione "Trocar usuario".

> [PRINT 2] - Clicar no nome da gestora para entrar

---

## 3. Conhecendo a Tela de Vistorias

Apos entrar, voce vera a tela principal dividida em:

### 3.1. Barra de Navegacao (topo)
No topo da tela ha um menu com as opcoes:
- **Vistorias** - Tela principal (onde voce esta)
- **Dashboard** - Graficos e metricas
- **Agenda** - Calendario semanal dos vistoriadores
- **Usuarios** - Lista de pessoas cadastradas
- **Admin** - Painel administrativo (exige PIN)

> [PRINT 3] - Barra de navegacao no topo

### 3.2. Legenda de Status
Logo abaixo, ha uma barra colorida com os status possiveis de uma vistoria:

| Cor | Status | Significado |
|-----|--------|-------------|
| Roxo | **Nova** | Vistoria criada, aguardando vistoriador receber |
| Azul | **Recebida** | Vistoriador recebeu e agendou |
| Amarelo | **Em andamento** | Vistoriador esta realizando |
| Laranja | **Sem Contrato** | Aguardando documentacao do cliente |
| Verde | **Concluida** | Vistoriador finalizou o trabalho |
| Verde escuro | **Finalizada** | Gestora validou e encerrou |
| Cinza | **Cancelada** | Vistoria foi cancelada |
| Amarelo (ambar) | **Aguardando recebimento** | Vistoriador ainda nao recebeu a vistoria |

> [PRINT 4] - Legenda de status com as cores

### 3.3. Filtros e Visualizacao
- **Filtro de mes:** Use as setas < > para navegar entre meses
- **Filtro de status:** Selecione um status especifico ou "Todos"
- **Modo de visualizacao:** Alterne entre "Lista" e "Kanban" (quadro com colunas)

> [PRINT 5] - Filtros de mes, status e modo de visualizacao

---

## 4. Criando uma Nova Vistoria

### Passo 1: Clicar em "+ Nova vistoria"
No topo da tela de vistorias, clique no botao verde **"+ Nova vistoria"**.

> [PRINT 6] - Botao "+ Nova vistoria"

### Passo 2: Preencher o formulario
Um formulario sera aberto com os seguintes campos:

**Campos obrigatorios:**

| Campo | O que preencher | Exemplo |
|-------|----------------|---------|
| **Codigo do imovel** | Codigo interno do imovel | 7910 |
| **Tipo** | Tipo da vistoria (selecionar na lista) | Ocupacao, Desocupacao, Revistoria, Visita, Placa/Fotos |
| **Vistoriador** | Quem vai realizar a vistoria | Leonardo, etc. |
| **Endereco** | Endereco completo do imovel | Rua Santa Catarina, 1454 |

**Campos opcionais:**

| Campo | O que preencher | Exemplo |
|-------|----------------|---------|
| **Numero** | Numero do imovel | 1454 |
| **Complemento** | Apartamento, bloco, etc. | Ap 301, Bloco B |
| **Bairro** | Bairro do imovel | Centro |
| **Cidade** | Cidade (Taquara, Parobe, Igrejinha) | Taquara |
| **Data do contrato** | Data limite do contrato (para ocupacao) | 20/03/2026 |
| **Observacoes** | Informacoes extras para o vistoriador | "Direto com inquilino no local" |

> [PRINT 7] - Formulario de nova vistoria preenchido

**Dica sobre o Codigo do Imovel:** Ao digitar o codigo e sair do campo, o sistema busca automaticamente os dados do ultimo imovel cadastrado com esse codigo (endereco, bairro, cidade). Isso economiza tempo!

> [PRINT 8] - Preenchimento automatico pelo codigo do imovel

### Passo 3: Salvar
Clique no botao **"Criar vistoria"** no final do formulario.

A vistoria sera criada com status **"Nova"** e aparecera na lista/kanban.

> [PRINT 9] - Vistoria criada com sucesso, aparecendo na lista

---

## 5. Notificando o Vistoriador pelo WhatsApp

Apos criar a vistoria, o vistoriador precisa ser notificado. Ha duas formas:

### Opcao A: Notificacao automatica
Se o WhatsApp estiver configurado no sistema, o vistoriador recebe automaticamente uma mensagem ao ser atribuido a uma nova vistoria.

### Opcao B: Notificacao manual
Na vistoria criada, clique no botao **"Notificar"** (icone de sino). O sistema enviara uma mensagem via WhatsApp para o vistoriador informando:
- Codigo e tipo da vistoria
- Endereco do imovel
- Nome da solicitante

> [PRINT 10] - Botao "Notificar" na vistoria

---

## 6. Acompanhando o Andamento

### 6.1. Visualizacao em Lista
Na visualizacao em lista, cada vistoria mostra:
- Codigo e tipo (com emoji: ocupacao, desocupacao, etc.)
- Endereco do imovel
- Data de registro
- Solicitante (quem criou)
- Prazo ou status do prazo
- Badge de status colorido
- Botoes de acao

> [PRINT 11] - Card de vistoria na lista com todas as informacoes

### 6.2. Visualizacao Kanban (Quadro)
Alterne para o modo **Kanban** clicando no botao correspondente. As vistorias aparecem organizadas em colunas por status:

```
| Nova | Recebida | Em andamento | Sem Contrato | Concluida | Finalizada | Cancelada |
```

Cada coluna mostra a quantidade de vistorias entre parenteses.

> [PRINT 12] - Visao kanban com colunas de status

### 6.3. Entendendo os Badges de Prazo

Os badges de prazo aparecem em cada vistoria e indicam:

- **Aguardando recebimento** (amarelo) - O vistoriador ainda nao recebeu a vistoria. O prazo so comeca a contar apos ele receber.
- **Prazo [dia da semana]** (verde) - Dentro do prazo, mostra o dia limite.
- **Prazo Amanha** (laranja) - Vence amanha.
- **Prazo Hoje** (amarelo) - Vence hoje.
- **Atrasada X dia(s)** (vermelho) - Prazo vencido.

**Regras de prazo por tipo:**
- **Ocupacao:** O prazo e a data do contrato. Conta desde a criacao.
- **Desocupacao:** 72 horas uteis (3 dias uteis) a partir de quando o vistoriador recebe.
- **Outros tipos:** Baseado na data do contrato, so conta apos o vistoriador receber.

> [PRINT 13] - Exemplos dos diferentes badges de prazo

---

## 7. Acoes Disponiveis para a Gestora

### Em vistorias com status "Nova":
- **Editar** - Modificar dados da vistoria
- **Excluir** - Remover a vistoria se ela estiver em "Nova" ou "Cancelada"
- **Notificar** - Enviar notificacao WhatsApp ao vistoriador

### Em vistorias com status "Concluida":
- **Finalizar** - Marcar como finalizada (encerrada)
- **Devolver p/ nova** - Voltar para "Nova" se necessario

### Em qualquer status (exceto finalizada/cancelada):
- **Cancelar** - Cancelar a vistoria

> [PRINT 14] - Botoes de acao em uma vistoria

---

## 8. Finalizando uma Vistoria

Quando o vistoriador concluir o trabalho, a vistoria aparecera com status **"Concluida"** (verde).

### Passo 1: Localizar a vistoria concluida
Filtre por status "Concluida" ou procure na lista/kanban.

### Passo 2: Clicar em "Finalizar"
Na vistoria concluida, clique no botao **"Finalizar"**. Uma confirmacao sera solicitada.

### Passo 3: Confirmar
Clique em "OK" na caixa de confirmacao. A vistoria passara para status **"Finalizada"** (verde escuro) e sera encerrada.

> [PRINT 15] - Vistoria concluida com botao "Finalizar"

---

## 9. Usando o Dashboard (Relatorios)

Clique em **"Dashboard"** no menu superior para ver metricas e graficos:

- **KPIs:** Total de vistorias criadas, em aberto, concluidas, atrasadas, SLA%
- **Graficos:** Evolucao diaria, distribuicao por tipo, por cidade, por status
- **Rankings:** Top gestoras e vistoriadores
- **Filtros:** Filtre por periodo, gestora, vistoriador, tipo, status, cidade

Voce tambem pode **exportar o relatorio em PDF** clicando no botao correspondente.

> [PRINT 16] - Tela do dashboard com graficos e KPIs

---

## 10. Horarios de Expediente

O sistema respeita os seguintes horarios para agendamento:

| Dia | Horario |
|-----|---------|
| Segunda a Sexta | 08:00 - 18:00 (com intervalo de almoco) |
| Sabado | 09:00 - 12:00 (sem almoco) |
| Domingo | Sem expediente |

Os vistoriadores so podem agendar vistorias dentro desses horarios. Se houver conflito com outra vistoria, o sistema sugere automaticamente o proximo horario disponivel.

---

## 11. Situacoes Comuns

### "O cliente cancelou a visita"
Se o cliente cancelou e a vistoria ja esta em "Recebida" ou "Em andamento":
1. Clique em **"Devolver p/ nova"** na vistoria
2. Confirme a acao
3. A vistoria volta para "Nova", o agendamento e removido, e o prazo reinicia

### "O vistoriador ainda nao recebeu a vistoria"
Voce vera o badge amarelo **"Aguardando recebimento"**. Isso e normal ate o vistoriador abrir o sistema e receber a vistoria. Se estiver demorando, use o botao **"Notificar"** para enviar um lembrete via WhatsApp.

### "Preciso mudar o vistoriador atribuido"
Enquanto a vistoria estiver em "Nova", clique em **"Editar"** e selecione outro vistoriador.

### "A vistoria esta sem contrato"
Se o vistoriador marcou como "Sem Contrato", significa que falta documentacao do cliente. Quando o contrato chegar, o vistoriador pode retomar o trabalho.

---

## 12. Dicas Rapidas

- **Atalho pelo codigo:** Ao criar uma nova vistoria, digite o codigo do imovel para o sistema preencher automaticamente o endereco
- **Kanban para visao geral:** Use o modo Kanban para ver rapidamente quantas vistorias estao em cada status
- **Dashboard mensal:** Use o Dashboard para acompanhar o desempenho do mes
- **Sabados:** Lembre que sabados tem expediente ate 12h, entao vistorias podem ser agendadas
- **Mapa:** Clique no botao "Mapa" em uma vistoria para abrir o endereco no Google Maps

---

## Roteiro de Prints Necessarios

Para completar este tutorial com imagens, tire os seguintes prints:

1. Tela inicial com lista de usuarios
2. Clicando no nome da gestora para entrar
3. Barra de navegacao no topo
4. Legenda de status com as cores
5. Filtros de mes, status e modo de visualizacao
6. Botao "+ Nova vistoria"
7. Formulario de nova vistoria preenchido
8. Preenchimento automatico pelo codigo do imovel
9. Vistoria criada aparecendo na lista
10. Botao "Notificar" na vistoria
11. Card de vistoria na lista com informacoes
12. Visao kanban com colunas
13. Exemplos dos badges de prazo
14. Botoes de acao em uma vistoria
15. Vistoria concluida com botao "Finalizar"
16. Tela do dashboard com graficos

---

*Sistema desenvolvido por Leo Antunes - WhatsApp: 51 99717-4866*
