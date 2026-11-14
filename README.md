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

O monitor detecta diferenças entre capturas de páginas oficiais. Isso não equivale a uma análise jurídica completa. Uma diferença pode decorrer de alteração legislativa, reorganização da página ou mudança na forma como o portal apresenta o texto.

O painel não inventa datas de publicação ou vigência. A data exibida é a data da detecção. Artigos que deixem de aparecer são classificados como não localizados, não como revogados com certeza. Sempre confirme a mudança no ato oficial e no Diário Oficial.

Se uma fonte falhar ou devolver pouco conteúdo, a captura anterior é preservada e o erro aparece no painel. O sistema não deve interpretar uma consulta com erro como ausência de alterações.

## Estrutura

- index.html, styles.css e app.js: site estático.
- data/laws.json: fontes oficiais acompanhadas.
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

## Verificação manual pelo próprio site

O botão **Verificar atualizações** abre a tela do workflow no GitHub Actions. Na página que abrir, clique em **Run workflow** e confirme em **Run workflow** novamente. Isso inicia uma consulta manual fora do horário da rotina diária. Quando a execução terminar e os dados forem publicados, use **Recarregar painel** para buscar os dados mais recentes no site.

O site é estático e não guarda token de acesso do GitHub. Por segurança, o botão encaminha para a confirmação autenticada do próprio GitHub em vez de tentar disparar a execução diretamente pelo navegador.


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
