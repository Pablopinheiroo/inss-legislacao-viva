# Pente-fino legislativo — andamento e política de fontes

## Regra de seleção
O banco de Lei Seca deve conter apenas dispositivos que correspondam aos objetos dos itens 14.2.2 e 14.2.3 do Edital INSS 2022. A norma existir na biblioteca não torna todos os seus artigos automaticamente cobrados.

## Fontes
- Para leis, decretos, emendas constitucionais e leis complementares, a fonte preferencial é o texto compilado/consolidado do Planalto.
- Para a IN 128/2022, que é ato normativo do INSS e não é consolidada pelo Planalto, usar o Portal IN oficial do INSS: https://portalin.inss.gov.br/in/540.
- O índice de alterações do gov.br não substitui o texto integral da IN.
- Texto revogado, redação riscada, dispositivo substituído ou redação histórica não pode ser tratado como vigente.
- Capturas antigas do projeto não são automaticamente consideradas atualizadas só porque o catálogo passou a apontar para a fonte oficial.

## Alteração já aplicada
- Constituição Federal: o art. 13 foi retirado do recorte de estudo, pois trata da língua portuguesa e dos símbolos nacionais, assunto que não aparece no conteúdo programático do item 14.2.2/14.2.3. O leitor agora respeita a lista `include_articles` e não exibe esse artigo.

## IN 128/2022 — problema verificado
A captura anterior tinha `parser_mode: index`, `snapshot_scope: official_change_index` e `article_count: 0`. Portanto, ela não continha o texto dos artigos. Foi localizada a página oficial do Portal IN do INSS, que identifica a IN 128 como atualizada em 12/08/2026 pela IN 212/2026. O catálogo agora aponta para essa fonte oficial, mas a captura integral ainda precisa ser refeita e validada para retirar redações riscadas e dispositivos revogados. Até isso ocorrer, não liberar questões por artigo da IN.

## Limite importante
A seleção artigo por artigo das demais normas continua em andamento. Não foram apagados artigos sem prova de que estão fora do edital. Eles permanecem fora da geração de questões automáticas até a classificação ser validada. Isso evita dois erros: estudar texto revogado e excluir matéria que o edital efetivamente cobra.

## Próximas etapas de auditoria
1. Reprocessar cada norma a partir da fonte oficial preferencial.
2. Comparar artigo, parágrafo e inciso com os tópicos do edital.
3. Classificar cada dispositivo como dentro do edital, parcialmente relacionado, complementar, fora do edital, revogado/desatualizado ou pendente de validação.
4. Remover do banco ativo somente os dispositivos classificados como fora do edital ou revogados, preservando histórico e trilha de auditoria.
5. Testar a navegação, busca, favoritos, progresso e todos os modos de treino após a filtragem.


## Recorte atualizado em 14/11/2026

O filtro ativo abrange as 27 normas cadastradas, incluindo Constitucional, Administrativo e Ética, além de Previdenciário. O art. 13 da Constituição foi retirado; a IN 128/2022 permanece sem artigos ativos até a captura consolidada.

A seleção foi aplicada também aos quatro bancos de treinamento. Contagens depois do filtro:
- data/questoes.json: 169 → 152 (17 removidos)
- data/encontre-erro.json: 74 → 66 (8 removidos)
- data/descubra-artigo.json: 65 → 59 (6 removidos)
- data/afirmacoes-por-artigo.json: 48 → 43 (5 removidos)

**Ponto de atenção:** o leitor já aponta para as fontes oficiais preferenciais, mas os arquivos de captura continuam identificados com a fonte efetivamente usada na coleta anterior. A sincronização integral direta com o Planalto/Portal IN é necessária antes de afirmar que todo o conteúdo foi recapturado e conferido nessa fonte.

## Inclusão de crimes contra a Seguridade Social
Foi acrescentado o Código Penal, com recorte apenas nos arts. 168-A e 337-A, porque o item 14.2.3, tópico 7, inclui expressamente crimes contra a Seguridade Social. A fonte é o Código Penal compilado do Planalto: https://www.planalto.gov.br/ccivil_03/decreto-lei/del2848compilado.htm.
A leitura automatizada direta do Planalto foi bloqueada. Por isso, a captura atual contém apenas trechos indexados da fonte oficial e permanece bloqueada para estudo e geração de questões. O art. 168-A contém §§ 5º e 6º inseridos pela LC 225/2026, depois do edital; eles precisam ficar separados do conteúdo de corte 2022 na validação final.

## Matérias além de Previdenciário
Foram mantidos no recorte de Lei Seca os dispositivos de Constitucional (direitos fundamentais, direitos sociais, nacionalidade, cidadania, Administração Pública e Seguridade Social), Administrativo (Lei 8.112, Lei 8.429 e Lei 9.784) e Ética (Decretos 1.171 e 6.029).
Português, Informática e Raciocínio Lógico, assim como tópicos teóricos de Direito Administrativo, Fundamentos Previdenciários, agente de desenvolvimento social e saúde/qualidade de vida no serviço público, foram cadastrados como módulos próprios, sem forçar vínculo com artigos de lei.


## Correção dos endereços preferenciais e contagem consolidada

Foram corrigidos os endereços oficiais do Planalto para a Lei 8.212/1991 (texto compilado), LOAS (texto compilado exibido pelo Planalto), Lei 10.559/2002 e Lei 10.779/2003. As questões mantêm `source_url` como endereço da captura real que sustentou o item; o campo `preferred_source_url` aponta para o Planalto. Essa separação é necessária porque a troca do link não substitui a captura nem atualiza o hash.

Contagem atual dos bancos ativos:
- data/questoes.json: 152
- data/encontre-erro.json: 66
- data/descubra-artigo.json: 43
- data/afirmacoes-por-artigo.json: 43

Situação: o recorte por artigo está aplicado em todas as normas cadastradas. A sincronização integral das capturas está sendo tentada pelo monitor automático acionado ao atualizar `data/laws.json`. Normas cujo Planalto bloqueie a coleta continuarão com a última captura válida, identificada como origem anterior, e não serão declaradas sincronizadas.

