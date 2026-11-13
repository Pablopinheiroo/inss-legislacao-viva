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