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

## Normas iniciais

A seleção inicial inclui Constituição Federal (dispositivos previdenciários), Leis 8.212/1991 e 8.213/1991, Decreto 3.048/1999, LOAS, EC 103/2019, LC 142/2013, Lei 9.796/1999, Decretos 6.214/2007 e 10.188/2019, Lei 14.176/2021 e IN PRES/INSS 128/2022.

A seleção é uma base de trabalho, não uma afirmação de que todas essas normas serão cobradas no próximo edital. A lista pode ser ajustada em data/laws.json.

## Limites importantes

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