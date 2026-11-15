# Relatório de regressão — 15/11/2026

## Problema relatado

O usuário informou que, depois do pente-fino do edital, o site parecia inteiro indisponível, a Biblioteca Lei Seca não abria os artigos e os treinamentos não carregavam. Também apontou que a área Estudar passou a exibir matérias sem lei seca (Português, Informática e Raciocínio Lógico), que não pertencem ao escopo deste site.

## Causa confirmada

1. Durante a tentativa de sincronizar as normas com o Planalto, o monitor automatizado recebeu páginas de desafio antirobô/redirecionamento genérico em vez do texto legislativo.
2. A falha do monitor foi tratada indevidamente como motivo para bloquear a leitura local de todas as 28 normas (`study_blocked: true`).
3. `app.js` também passou a exigir `source_sync_status === "sincronizado_e_validado"` para considerar uma norma utilizável. Como nenhuma norma ficou sincronizada, o filtro eliminou o conteúdo dos jogos, da memorização e da Biblioteca.
4. Foi acrescentado um painel `data/edital-materias.json` com 13 áreas do edital, incluindo matérias sem legislação própria, contrariando o escopo da plataforma, que é a Lei Seca e seus instrumentos normativos.
5. A suíte E2E também falhava porque esperava os rótulos “Verificação concluída/parcial/erro”, mas o painel mostra “Falha na verificação” quando `data/legislacao.json` tem `status: erro`. Isso era uma incompatibilidade do teste, não a causa do bloqueio dos artigos.

## Correções aplicadas

- Removido o painel das 13 matérias da área Estudar.
- Removido `data/edital-materias.json`; o projeto volta a exibir apenas normas e instrumentos legislativos cadastrados.
- Restaurado o acesso às 27 capturas locais com artigos. A IN 128/2022 permanece sem leitura de artigos porque o arquivo local disponível contém somente o índice de alterações, não o texto integral.
- Alterado `isLawSourceReady`: a falha do monitor remoto não invalida automaticamente uma captura local existente. Cada questão continua sendo conferida pelo hash do artigo, trecho-âncora e correspondência com a URL da própria captura.
- Reativado o modo Completar Lei Seca para as normas com captura local.
- Mantidos os links oficiais do Planalto e do Portal IN.
- Incluído aviso explícito na Biblioteca e nos modos de que as capturas locais são históricas e aguardam revalidação direta na fonte oficial.
- Os textos dos modos agora dizem “captura salva”, e não “fonte atual consultada”.
- Atualizada a suíte E2E para verificar que os artigos e os bancos locais voltaram a ficar acessíveis, e que a Lei Seca não exibe Português, Informática ou Raciocínio Lógico como normas.
- A rotina de testes de backup continua preservada.

## Situação das fontes

O Planalto continua redirecionando consultas automatizadas para uma página genérica/desafio antirobô. Isso impede que o monitor confirme as versões compiladas, mas não prova que os links estejam ausentes ou que o usuário humano não consiga abri-los no navegador.

As capturas antigas foram preservadas. A aplicação não declara que elas foram atualizadas: mostra um aviso de revalidação pendente e mantém o link direto para a fonte oficial.

## Normas liberadas localmente

- 27 normas com captura local disponível: leitura restaurada e treinamentos reativados mediante validação interna da captura.
- IN 128/2022: continua bloqueada para leitura artigo a artigo até importar o texto integral consolidado do Portal IN.

## Critério para encerramento

A regressão de interface/conteúdo só será considerada resolvida depois da conclusão dos testes E2E e do Pages build/deployment no commit mais recente. A auditoria das fontes legislativas é uma pendência distinta: deve ser concluída quando o acesso ao texto oficial integral estiver disponível.
