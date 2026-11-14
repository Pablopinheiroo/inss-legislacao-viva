# Radar Legislativo INSS

Site gratuito para acompanhar diferenças de texto em normas relacionadas ao estudo do concurso do INSS.

## O que o projeto faz

- Mostra um painel com um sino de novidades dentro do próprio site.
- Compara o texto atual das fontes oficiais com a última captura válida.
- Quando consegue separar os dispositivos, identifica artigo alterado, incluído ou não localizado.
- Mostra o texto anterior e o texto atual, a data em que a diferença foi detectada e o link oficial.
- Permite marcar cada item como Não estudado, Revisando ou Estudado.
- Executa uma verificação diária pelo GitHub Actions e também permite execução manual.

Não envia notificações para celular, e-mail ou Telegram. O sino funciona dentro do site. As marcações ficam salvas no navegador usado e não são sincronizadas entre dispositivos.

## Publicar o site

1. Abra Settings no repositório.
2. Entre em Pages.
3. Em Build and deployment, selecione Deploy from a branch.
4. Escolha a branch main e a pasta /(root).
5. Clique em Save.

O endereço esperado é:
https://pablopinheiroo.github.io/inss-legislacao-viva/

## Fazer a primeira verificação

1. Abra a aba Actions.
2. Se necessário, habilite os workflows.
3. Selecione Monitorar legislação.
4. Clique em Run workflow e confirme.

A primeira execução cria a linha de base. Ela não cria alertas retroativos. As diferenças passam a ser detectadas nas execuções seguintes.

A rotina automática está programada para 09:17 UTC (06:17 no horário de Brasília). O GitHub pode atrasar ou deixar de executar uma agenda em períodos de alta demanda. Em repositórios públicos, agendas também podem ser desativadas após 60 dias sem atividade no repositório.

## Base no edital de 2022

O catálogo foi conferido com o Edital nº 1 - INSS, de 12 de setembro de 2022, para Técnico do Seguro Social, alterado pelo Edital PRES/INSS nº 2, de 14 de setembro de 2022. O item 14.2.3 reúne o conteúdo específico; o item 14.2.2 inclui normas de Ética, Direito Constitucional e Direito Administrativo.

O projeto acompanha 27 textos normativos expressamente citados nesses conteúdos: Constituição Federal (somente os artigos pertinentes), dois decretos de Ética, três leis de Administração Pública, doze normas de Previdência/Assistência Social e regimes próprios, além de atos sobre benefícios especiais e seguro-defeso. A relação, o enquadramento por item e o endereço do edital ficam em data/laws.json e data/edital-base.json.

Fontes oficiais do edital:
- [Página de editais de 2022 do INSS](https://www.gov.br/inss/pt-br/centrais-de-conteudo/legislacao/edital/2022)
- [Edital no Diário Oficial da União](https://www.in.gov.br/en/web/dou/-/edital-n-1-inss-de-12-de-setembro-de-2022-429587147)
- [PDF do Cebraspe](https://cdn.cebraspe.org.br/concursos/inss_22/arquivos/ED_1_INSS_22_ABERTURA.PDF)

A seleção é a base do edital de 2022, não uma afirmação de que todas as normas serão cobradas no próximo concurso. Quando houver novo edital, o catálogo deve ser revisado.

## Limites importantes

O monitor tenta primeiro a base oficial de Legislação Informatizada da Câmara dos Deputados, com fontes oficiais alternativas quando disponíveis. Para algumas normas, a página disponível pode ser a publicação original, e não uma consolidação atualizada; esses casos exigem conferência adicional. Para a IN 128/2022, a consulta automatizada usa a página oficial do INSS que lista os atos modificadores, porque o texto interativo pode bloquear robôs. Portanto, essa norma é acompanhada pelo histórico de alterações, não por comparação artigo a artigo.

O monitor detecta diferenças entre capturas de páginas oficiais e confere se a resposta contém a identificação da norma esperada. Redirecionamentos para outro domínio e páginas genéricas sem o número/ano da norma são rejeitados; a captura anterior é preservada. Isso não equivale a uma análise jurídica completa. Uma diferença pode decorrer de alteração legislativa, reorganização da página ou mudança na forma como o portal apresenta o texto.

O painel não inventa datas de publicação ou vigência. A data exibida é a data da detecção. Artigos que deixem de aparecer são classificados como não localizados, não como revogados com certeza. Sempre confirme a mudança no ato oficial e no Diário Oficial.

Se uma fonte falhar ou devolver pouco conteúdo, a captura anterior é preservada e o erro aparece no painel. O sistema não deve interpretar uma consulta com erro como ausência de alterações.

## Auditoria das fontes legislativas

A revisão técnica individual das 27 normas, com classificação das fontes, resultado da última captura e limitações identificadas, está em [Auditoria das 27 fontes — 14/11/2026](AUDITORIA_FONTES_2026-11-14.md). A auditoria técnica não equivale a uma certificação jurídica da vigência de cada dispositivo.

## Estrutura

- index.html, styles.css e app.js: site estático.
- data/laws.json: fontes oficiais acompanhadas.
- AUDITORIA_FONTES_2026-11-14.md: revisão técnica individual das 27 normas e suas fontes.
- data/encontre-erro.json: banco de itens do jogo Encontre o erro.
- data/legislacao.json: dados exibidos pelo site.
- data/snapshots/: últimas capturas válidas.
- scripts/monitor.py: comparação dos textos.
- .github/workflows/monitorar-legislacao.yml: execução diária.

## Execução local opcional

Requer Python 3.11 ou superior. Instale as dependências com:

    python -m pip install -r requirements.txt

Depois execute:

    python scripts/monitor.py

## Licença

MIT. O projeto aponta para textos oficiais e registra diferenças para fins de estudo.

## Treino de questões Certo/Errado

A aba **Treinar C/E** oferece um banco inicial de itens autorais no estilo Certo ou Errado. Cada questão informa a matéria, a norma e o artigo; depois da resposta, mostra o gabarito, uma explicação, o trecho literal usado como referência e o link da fonte oficial. É possível escolher a matéria e fazer sessões de 5, 10 ou todas as questões disponíveis.

O banco atual é inicial e não cobre integralmente as 27 normas. As questões devem ser ampliadas e revisadas à medida que o catálogo de leis for auditado. A redação usada como referência deve sempre ser conferida na versão consolidada oficial.

## Como a verificação da legislação funciona

A rotina diária do GitHub Actions consulta as fontes oficiais cadastradas em `data/laws.json`. Para cada norma, o monitor compara o conteúdo obtido agora com o snapshot anterior salvo em `data/snapshots/`. Quando encontra diferença, registra o texto anterior e o atual em `data/legislacao.json`; quando a fonte falha ou retorna conteúdo incompleto, preserva a captura anterior e registra o erro. A rotina diária está programada para 06:17 no horário de Brasília.

O painel do site não acessa diretamente cada portal legislativo. Ele lê os resultados que o monitor gravou no repositório e mostra o histórico. O botão **Executar verificação manual no GitHub** abre o workflow; na página do GitHub ainda é necessário clicar em **Run workflow**. Quando a execução terminar, volte ao Radar e clique em **Recarregar painel**. Esse último botão apenas carrega os dados publicados e não inicia uma nova consulta.

O site é estático e não guarda token de acesso do GitHub. Por isso, não é seguro disparar uma execução autenticada diretamente do navegador. Para iniciar e acompanhar uma execução inteiramente dentro do site seria necessário um serviço intermediário autenticado; o projeto atual evita esse serviço e mantém a rotina automática gratuita do GitHub Actions.


## Recorte da Constituição e modo Lei Seca

A Constituição é obtida da página oficial da Câmara dos Deputados, identificada como atualizada até a Emenda Constitucional nº 141/2026. O projeto guarda somente os 31 artigos selecionados para o recorte do edital: arts. 5º a 17, 37 a 41, 149 e 193 a 204. A captura não guarda a Constituição inteira.

O monitor compara o conteúdo dos dispositivos salvos, e não a página inteira. Alterações em menus, rodapés e em artigos que não fazem parte desse recorte não devem gerar alertas para a Constituição. Se a fonte não apresentar todos os 31 artigos, a captura é recusada e o snapshot anterior é preservado. Uma troca de fonte ou de formato gera uma nova linha de base, sem falsos alertas causados pela mudança técnica.

A aba **Completar Lei Seca** carrega os artigos dos snapshots e oculta algumas palavras para treino. É possível escolher a norma, o artigo e o nível de dificuldade. O texto aparece em fonte serifada, maior e com espaçamento adequado para leitura.

A atualização automática continua diária. A verificação manual abre o workflow do GitHub Actions; é necessário confirmar a execução no GitHub. O site estático não guarda token de acesso.


## Modo de jogo Encontre o erro

A aba **Encontre o erro** apresenta enunciados com uma expressão propositalmente alterada. O estudante toca no trecho que está incorreto e recebe a correção, a explicação, o texto literal do artigo e o link da fonte oficial. É possível filtrar por matéria e escolher sessões de 5, 10 ou todos os itens disponíveis.

O banco inicial contém 13 itens. Antes de liberar uma questão, o site consulta o snapshot mais recente do artigo e verifica se a expressão correta continua presente no texto capturado. Se o artigo não estiver disponível ou a expressão correta não for encontrada, o item é suspenso automaticamente. Essa verificação reduz o risco de treinar com uma correção que deixou de corresponder ao texto salvo, mas não substitui a revisão jurídica do enunciado quando houver alteração legislativa.


## Modo de jogo Descubra o artigo

A aba **Descubra o artigo** apresenta uma descrição de um assunto previsto na norma e pede que o estudante escolha, entre quatro números, o artigo correspondente. Após a resposta, mostra o gabarito, a explicação, o texto literal do artigo e o link da fonte oficial. O jogo permite filtrar por matéria e escolher sessões de 5, 10 ou todos os itens disponíveis.

O banco inicial possui 29 questões de sete normas: Lei 9.784/1999, Lei 8.429/1992, Decreto 6.029/2007, Lei 8.213/1991, Lei 8.212/1991, LOAS e Lei 8.112/1990. Antes de liberar cada questão, o site confere se o artigo correto, a frase de referência e as quatro alternativas existem nas capturas salvas. Itens incompatíveis com a captura atual são suspensos automaticamente. Essa validação técnica não substitui a revisão jurídica da descrição da questão.


## Modo de jogo Várias afirmações

A aba **Várias afirmações** reúne dois ou mais itens de Certo ou Errado sobre um mesmo artigo. O estudante pode ler o dispositivo completo, responder cada afirmação, conferir o gabarito e a justificativa e só depois avançar para outro artigo. Ao final, o painel mostra o resultado geral, o desempenho por artigo e permite repetir os artigos em que houve erros.

O banco inicial contém 16 artigos e 46 afirmações, extraídos de seis normas. O site verifica cada frase-âncora no snapshot mais recente do artigo antes de liberar o conjunto. Se o texto ou alguma referência não corresponder à captura salva, o conjunto inteiro é suspenso até revisão.


## Modo Antes e depois

A aba **Antes e depois** transforma diferenças reais registradas em `data/legislacao.json` em um treino. Em cada questão, as duas versões aparecem embaralhadas e o estudante identifica qual corresponde à captura mais recente. Depois, o modo mostra o texto anterior, o atual, a explicação do monitor e o link da fonte oficial.

O modo não inventa alterações nem usa exemplos simulados. Só libera diferenças que podem ser comparadas por artigo. Mudanças de texto integral, como alterações no índice oficial da IN 128/2022, continuam disponíveis no Radar, pois não representam um artigo individual. Enquanto o monitor não registrar mudanças artigo por artigo, o botão de início permanece desativado e o site informa isso ao estudante.

A versão identificada como **Agora** é a captura mais recente consultada pelo monitor. A data de detecção não é necessariamente a data de publicação ou de início da vigência. Confirme sempre o ato oficial antes de atualizar seu material de estudo.


## Modo Memorização ativa

A aba **Memorização ativa** reúne cartões por artigo a partir das perguntas já validadas em **Descubra o artigo** e dos temas de **Várias afirmações**. Antes de usar o cartão, o site aproveita os artigos que esses modos já conferiram nas capturas salvas.

O estudante recebe uma pergunta ou um tema, tenta explicar o conteúdo sem consultar e depois revela o texto integral do artigo para comparar. A avaliação é feita pelo próprio estudante; o site não finge corrigir uma resposta livre.

As opções **Esqueci**, **Lembrei em parte** e **Lembrei bem** organizam a próxima revisão em 10 minutos, 1 dia ou um intervalo crescente (3, 6, 12 dias e assim por diante, limitado a 30 dias). O progresso continua no armazenamento local do navegador, sem conta ou servidor. Agora é possível exportar um backup em JSON e importá-lo em outro navegador ou dispositivo. O modo não envia lembretes: os cartões aparecem como pendentes quando o site é aberto.


## Precisão do histórico de alterações

O monitor usa snapshots da versão 3. Além do texto integral de cada artigo, guarda uma estrutura hierárquica para comparar caput, parágrafos, incisos, alíneas e itens numerados. Quando apenas uma dessas partes muda, o Radar registra a parte correspondente, sem tratar automaticamente o artigo inteiro como alterado.

A classificação separa três fatos diferentes:
- **Diferença textual:** o conteúdo capturado está diferente, foi incluído ou deixou de ser localizado.
- **Indicação de revogação:** só é marcada quando a fonte oficial apresenta uma anotação expressa de revogação no próprio dispositivo. A ausência de um trecho na captura não é considerada prova de revogação.
- **Vigência:** fica como não confirmada quando a fonte não informa expressamente uma data de início. Uma data expressa de vigência futura ou já transcorrida é registrada separadamente, mas ainda exige conferência do ato modificador e de sua aplicação.

As datas de publicação e de entrada em vigor só são preenchidas quando a fonte traz uma indicação textual clara. A data de assinatura ou a data que aparece na referência de uma lei alteradora não é tratada automaticamente como data de publicação ou de vigência. Quando não há informação suficiente, o campo permanece vazio em vez de receber uma data presumida.

A mudança do parser exige uma nova captura-base das fontes. Na primeira execução com a versão 3, as capturas anteriores são substituídas por novas bases estruturadas, sem gerar alertas artificiais por causa da mudança técnica. O histórico de alertas já existente é preservado.


## Proteção contra falhas, bloqueios e limites de acesso

O monitor não transforma falha HTTP, timeout, bloqueio de robô, página de verificação ou limite de consultas em artigo revogado ou removido. Em uma falha, o snapshot válido anterior é preservado, nenhum alerta de alteração é criado para aquela fonte e o painel informa a situação da consulta. O monitor também compara a quantidade de artigos com a captura anterior: se a mesma fonte passar a devolver uma fração muito menor dos artigos ou deixar de apresentar a estrutura de artigos, a nova captura é rejeitada como possivelmente incompleta.

As consultas agora guardam diagnóstico por tentativa: endereço consultado, código HTTP quando disponível, tipo de falha, quantidade de tentativas e indicação de Retry-After. Respostas temporariamente limitadas (HTTP 429) e erros de servidor (HTTP 5xx) recebem novas tentativas controladas. A configuração respeita um limite curto de espera para não prender o workflow; depois disso, o monitor tenta outra fonte cadastrada, quando houver. Se nenhuma fonte funcionar, registra a falha e mantém os dados anteriores.

O painel diferencia:
- **Limite de acesso:** a fonte respondeu HTTP 429 ou indicou limite de consultas.
- **Acesso bloqueado:** a fonte recusou o acesso (por exemplo, HTTP 403) ou apresentou uma tela de proteção/verificação.
- **Fonte indisponível:** houve timeout, falha de rede ou erro temporário do servidor.
- **Resposta inválida:** o conteúdo recebido não pôde ser interpretado ou não passou na validação da norma.
- **Fonte alternativa usada:** a fonte principal falhou, mas outra fonte cadastrada respondeu corretamente.

### Acionamento manual sem abrir a tela do GitHub Actions

O GitHub Pages não pode guardar um token privado no HTML ou no JavaScript. Isso não impede todas as alternativas sem servidor: uma opção possível é criar um **GitHub App** e usar o fluxo de autorização Web com OAuth 2.0 + PKCE. O app poderia ser instalado somente neste repositório, receber apenas as permissões de Actions necessárias (leitura e escrita) e emitir um token de usuário limitado às permissões do app e do próprio usuário. A documentação também permite restringir o token a um único repositório por meio de repository_id. O token de usuário expira por padrão após oito horas.

Essa opção exige criar e configurar o GitHub App, definir a URL de retorno do site, pedir autorização ao usuário no GitHub e proteger cuidadosamente o token mantido no navegador. O fluxo público também precisa tratar PKCE corretamente; não devemos simplesmente colocar um token pessoal ou um segredo de acesso no JavaScript. Um OAuth App tradicional que pede o escopo repo não é a opção indicada, pois esse escopo é amplo. Referências oficiais: [fluxo Web e PKCE de um GitHub App](https://docs.github.com/pt/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-user-access-token-for-a-github-app), [permissão Actions exigida para disparar workflows](https://docs.github.com/en/rest/actions/workflows) e [boas práticas de segurança para apps públicos](https://docs.github.com/en/apps/creating-github-apps/about-creating-github-apps/best-practices-for-creating-a-github-app).

Ainda não ativamos essa alternativa porque ela exige configuração e revisão de segurança adicionais. Mantivemos a decisão atual: o botão abre o workflow no GitHub; basta clicar em **Run workflow**. O botão **Recarregar painel** continua apenas carregando os dados publicados.


## Área Lei Seca — biblioteca e leitor

A navegação principal inclui a área **Lei Seca**, separada dos jogos. Ela carrega todas as normas cadastradas em data/laws.json — inclusive as que estiverem com o monitoramento desativado — e abre os arquivos de captura em data/snapshots/.

Na biblioteca, as normas são agrupadas primeiro por matéria e depois por assunto. O catálogo atual possui 27 normas, distribuídas entre Direito Constitucional, Direito Administrativo, Ética no Serviço Público e Direito Previdenciário. É possível buscar por nome, tipo, matéria ou assunto e filtrar por matéria. Ao selecionar uma norma com captura por artigos, o leitor permite:

Cada cartão da biblioteca também exibe o número e o nome da norma, a data e hora da última consulta bem-sucedida, um aviso quando o monitor detectou alterações nos últimos 30 dias e um link direto para a fonte oficial utilizada na consulta. Quando uma fonte alternativa é usada, o link aponta para ela. Uma consulta que falhou não é apresentada como atualização bem-sucedida.
- escolher um artigo e avançar ou voltar entre os dispositivos;
- pesquisar palavras e expressões dentro do texto dos artigos daquela norma;
- marcar artigos como estudados;
- favoritar artigos e, quando a estrutura do snapshot permite, favoritar caput, parágrafos, incisos, alíneas e itens;
- abrir o treino **Completar Lei Seca** diretamente a partir do artigo selecionado, quando houver texto suficiente para gerar lacunas;
- consultar a fonte que foi usada na captura e a data em que o monitor a registrou.

A Constituição aparece somente com o recorte de artigos selecionados no catálogo. A IN 128/2022, por enquanto, aparece como índice de atos modificadores: o arquivo acompanhado não oferece a redação consolidada separada em artigos e, por isso, o leitor avisa que é necessário abrir a fonte oficial. Normas cuja consulta mais recente falhou continuam usando a última captura válida e exibem um aviso.

As marcações de estudo e os favoritos ficam no armazenamento local do navegador. Não exigem conta, mas também não são sincronizados entre dispositivos. O texto exibido é a captura do monitor, não uma garantia de consolidação jurídica integral; quando a auditoria indicar publicação original ou acompanhamento por índice, confira a fonte oficial antes de usar o conteúdo como redação vigente.


## Salvamento, privacidade e backup do progresso

O progresso pessoal é salvo no próprio navegador, usando `localStorage` e a mesma origem do GitHub Pages. A atualização dos arquivos do site não apaga esses dados: os identificadores de armazenamento são mantidos estáveis. Os registros de jogos, revisões, sessões, favoritos, artigos estudados, XP e conquistas passam por uma camada central em `data-storage.js`.

Na área **Estudar**, abra **Backup e segurança dos dados** para exportar ou importar um arquivo JSON. O backup reúne os dados pessoais do navegador, mas não inclui uma partida que esteja em andamento. Antes de importar, o site baixa uma cópia do progresso que está no navegador; depois, restaura o arquivo escolhido.

O arquivo de backup não é criptografado. Guarde-o em local privado e não o publique no GitHub nem o envie junto com o código do projeto. O site não pede senha, token ou chave de acesso para salvar o progresso.

**Limite importante:** GitHub Pages é hospedagem estática. O backup manual permite transportar dados entre navegadores e dispositivos, mas não cria sincronização automática. Uma sincronização futura exigiria um serviço externo com autenticação e avaliação própria de segurança.


### Atualização das capturas e validade das questões

O monitor faz novas consultas periódicas. Uma consulta pode atualizar o horário da captura mesmo quando a redação de um artigo continua exatamente igual. Por isso, a validação das questões confere o hash do artigo usado no enunciado e os trechos que sustentam o gabarito, em vez de exigir que o horário da última consulta seja igual ao horário de criação da questão. Quando o texto do artigo muda, o hash deixa de corresponder e a questão precisa ser revisada ou suspensa.
