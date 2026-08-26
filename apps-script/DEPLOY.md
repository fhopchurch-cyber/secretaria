# Etapa 1 — Publicar o painel que lê ao vivo (somente leitura)

> Objetivo: ver os dados reais (3 planilhas + agenda) dentro do painel, sem gravar nada.
> Tempo: ~10 minutos. Você precisa estar logado como **fhopchurch@fhop.com**.

## 1. Criar o projeto
1. Entre em **https://script.google.com** logado na conta **fhopchurch@fhop.com**.
2. Clique em **Novo projeto**.
3. Dê um nome no topo: **Central de Reservas FHOP**.

## 2. Colar o código
1. No arquivo `Código.gs` que já vem aberto, **apague tudo** e cole o conteúdo de **`Codigo.gs`** (deste repositório).
2. Clique no **+** ao lado de "Arquivos" → **HTML** → nomeie exatamente **`Index`** (sem `.html`).
3. **Apague** o conteúdo padrão desse arquivo e cole o conteúdo de **`Index.html`**.
4. Clique no ícone de **salvar** (disquete).

## 3. Autorizar e testar a leitura
1. No topo, no seletor de função, escolha **`_teste`**.
2. Clique em **Executar** (▶).
3. Vai abrir um pedido de **autorização** — é normal:
   - Escolha a conta **fhopchurch@fhop.com**.
   - Em "O Google não verificou este app", clique em **Avançado → Acessar Central de Reservas FHOP (não seguro)**. (É seu próprio script; seguro.)
   - Clique em **Permitir** (acesso a Planilhas e Agenda — só leitura no nosso código).
4. Depois de rodar, abra **Execuções** (menu à esquerda, ícone de relógio) ou **Ver → Registros** e confira algo como:
   ```
   Requests: 12
   Pastoral: 8
   Agenda: 30
   Erros: []
   ```
   - Se **Erros** vier vazio `[]` e os números fizerem sentido → leitura OK. 🎉
   - Se aparecer erro citando uma planilha, o mais comum é a conta **fhopchurch não ter acesso** àquela planilha. Compartilhe a planilha (em leitura) com `fhopchurch@fhop.com` e rode de novo.

## 4. Publicar o painel (Web App)
1. Botão azul **Implantar** (canto superior direito) → **Nova implantação**.
2. Em "Selecionar tipo" (engrenagem) → **App da Web**.
3. Configure:
   - **Descrição:** Painel Secretaria (Etapa 1)
   - **Executar como:** **Eu (fhopchurch@fhop.com)**
   - **Quem pode acessar:** **Apenas eu** (por enquanto — é só você testando). Depois trocamos para a equipe.
4. Clique **Implantar** → copie a **URL do app da Web**.
5. Abra essa URL: o painel deve carregar mostrando os dados reais.

## Pronto ✅
Você está vendo, ao vivo, os pedidos das planilhas e os eventos da agenda — com os conflitos detectados — sem ter alterado nada em lugar nenhum.

## Se algo não aparecer
- **Números zerados ou erro numa planilha:** confirme que `fhopchurch@fhop.com` tem acesso de leitura às 3 planilhas.
- **Agenda vazia:** confirme que a conta enxerga a agenda `fhopchurch@fhop.com` (ela é a dona, então deve estar ok).
- **Espaço "não reconhecido" em muitos itens:** é o dicionário de-para; a gente amplia os apelidos no `Codigo.gs` (variável `ALIASES`).

---

# Etapa 2 — Aprovar grava na agenda + convida o solicitante

> Agora o painel **escreve**: ao Aprovar, cria o evento na agenda `fhopchurch` e envia o convite por e-mail.
> O estado (aprovado/recusado/encaminhado) fica numa planilha **"Central"** que o script cria sozinho — no servidor, nunca no navegador.

## 1. Atualizar os dois arquivos
1. No Apps Script, abra **`Código.gs`** → selecione tudo (Cmd+A) → apague → cole a versão nova de `Codigo.gs`.
2. Abra **`Index.html`** → Cmd+A → apague → cole a versão nova de `Index.html`.
3. **Salve** (Cmd+S).

## 2. Re-autorizar (novas permissões)
O código agora usa **criar eventos na agenda** e **criar a planilha Central**. Então precisa autorizar de novo:
1. Selecione a função **`_teste`** → **Executar**.
2. Vai pedir autorização outra vez — agora inclui **gerenciar sua agenda** e **criar planilhas**. Escolha fhopchurch → Avançado → Permitir.
3. Ao rodar, o script cria automaticamente uma planilha nova no Drive da fhopchurch chamada **"FHOP — Central de Reservas (Estado)"**. Isso é esperado (é o "cérebro" do estado). Não precisa mexer nela.

## 3. Republicar a nova versão
1. **Implantar** → **Gerenciar implantações**.
2. Na implantação existente, clique no **lápis** (editar).
3. Em **Versão**, escolha **Nova versão** → **Implantar**. (A URL continua a mesma.)

## 4. Testar o ciclo
1. Abra a URL do painel → aba **Pedidos**.
2. Num pedido pendente, clique **✓ Aprovar**.
   - O evento aparece na **agenda fhopchurch** (confira no Google Agenda).
   - Se o pedido tiver e-mail, o solicitante **recebe o convite** por e-mail.
   - O pedido sai de "pendentes" e o painel se atualiza.
3. Clique **↩ Desfazer** para remover o evento e voltar a pendente (dá pra testar sem medo).
4. Aba **Atendimento** → escolha um pastor no seletor → **Encaminhar**.

> ⚠️ **Aprovar cria evento e envia e-mail de verdade.** Para testar sem incomodar ninguém, use um pedido de teste (ou apague o e-mail do pedido antes). O **Desfazer** apaga o evento criado.

## Liberar para a equipe (quando quiser)
Em **Implantar → Gerenciar implantações → editar → Quem pode acessar**, troque de "Apenas eu" para **"Qualquer pessoa com Conta do Google"** (e a gente adiciona uma checagem de e-mails autorizados), ou mantenha restrito às contas da equipe conforme sua organização permitir.

---

# Etapa 3 — Página pública de reserva

> Um link aberto para a igreja fazer reservas. Avisa conflito na hora e cai direto em "Pedidos".
> O painel da secretaria continua **restrito** — quem não é do time cai na página de reserva, nunca no painel.

## 1. Atualizar o código + criar a página nova
1. **`Código.gs`**: cole a versão nova (Cmd+A → Delete → Cmd+V → Cmd+S).
   - Dentro dele há a lista **`ALLOWLIST`** (e-mails que podem abrir o painel). Adicione ali os e-mails da equipe da secretaria, separados por vírgula.
2. Crie um **novo arquivo HTML** chamado exatamente **`Reserva`** (o `+` → HTML) e cole o conteúdo de **`Reserva.html`**. Salve.

## 2. Testar
- Rode **`_teste`** (▶). Cria a aba "solicitacoes" na planilha Central. Sem novas permissões.

## 3. Republicar o PAINEL (implantação existente)
- **Implantar → Gerenciar implantações → lápis → Versão: Nova versão → Implantar.**

## 4. Criar a IMPLANTAÇÃO PÚBLICA (link de reserva)
1. **Implantar → Nova implantação.**
2. Tipo (engrenagem) → **App da Web**.
3. Configure:
   - **Descrição:** Reserva pública
   - **Executar como:** **Eu (fhopchurch@fhop.com)**
   - **Quem pode acessar:** **Qualquer pessoa**
     - *Se sua organização não deixar "Qualquer pessoa", escolha "Qualquer pessoa com Conta do Google" (aí a pessoa faz login antes).*
4. **Implantar** → copie a **URL**. **Essa é o link público de reserva** — compartilhe com a igreja.

## Como fica
- **Link público** (implantação "Qualquer pessoa") → mostra a **página de reserva** (a pessoa não é do time).
- **Link do painel** (implantação restrita, logado como fhopchurch) → mostra o **painel da secretaria**.
- Uma reserva enviada aparece no painel em **Pedidos**, com origem "Reserva online", pronta para **Aprovar / Recusar / Editar / Excluir**.

> Segurança: mesmo que alguém descubra o link do painel, só abre para os e-mails da `ALLOWLIST`; os demais são levados para a página de reserva.
