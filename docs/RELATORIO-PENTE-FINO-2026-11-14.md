# Continuação do pente-fino — 14/11/2026

## Escopo e regra de trabalho

O recorte continua baseado nos itens 14.2.2 e 14.2.3 do Edital INSS 2022 (Edital nº 1, com alteração do Edital nº 2). A prioridade por norma é uma organização editorial de estudo, não um peso oficial atribuído pelo Cebraspe.

Fontes de texto legal: usar somente endereços oficiais. Preferência por texto compilado/consolidado do Planalto quando existir. Para a IN 128/2022, usar o Portal IN oficial do INSS. Não aceitar páginas de bloqueio, respostas genéricas, capturas parciais ou redações riscadas como texto vigente.

## Alterações realizadas nesta etapa

1. Atualizado o catálogo `data/laws.json` para apontar o monitoramento diretamente às URLs oficiais preferenciais. O monitor não possui mais fallback para páginas paralelas nessas normas.
2. O Decreto 3.048/1999 passou a apontar para o texto compilado oficial: https://www.planalto.gov.br/ccivil_03/decreto/d3048compilado.htm.
3. O Decreto 6.214/2007 passou a priorizar o arquivo compilado oficial: https://www.planalto.gov.br/ccivil_03/_ato2007-2010/2007/decreto/d6214compilado.htm.
4. A Lei 10.779/2003 passou a priorizar o endereço compilado indicado pelo próprio Planalto: https://www.planalto.gov.br/ccivil_03/leis/2003/L10.779compilado.htm.
5. As Leis 8.429/1992 e 8.742/1993 foram identificadas como textos compilados no catálogo do Planalto.
6. O recorte da Lei 8.112/1990 foi reduzido de 182 para 136 dispositivos, concentrando-se nos blocos expressos no edital: provimento/nomeação, vacância, remoção, redistribuição, substituição, direitos e vantagens, regime disciplinar e responsabilidades.
7. A Lei 8.429/1992 teve o art. 23-B incluído no recorte. Os arts. 24 e 25 (vigência e revogação) permanecem fora.
8. No Decreto 8.424/2015, o art. 9º foi incluído por alterar o Regulamento da Previdência Social em matéria ligada ao pescador artesanal. O art. 12 foi retirado por tratar de regra de transição para períodos de defeso iniciados até 31/03/2015; o art. 10 revogado segue excluído.
9. A questão `8212-art10-financiamento-01` foi retirada do banco ativo porque o hash do texto legal não confere com a captura usada. Foi arquivada em `data/questoes-arquivadas.json`, aguardando nova redação e validação.
10. Criado `data/edital-materias.json` com as 13 áreas/disciplina do programa, incluindo Português, Informática, Raciocínio Lógico, Constitucional, Administrativo, Ética e os blocos de Previdenciário.

## Verificação das fontes — resultado desta rodada

Os domínios e endereços oficiais foram configurados, mas isso não significa que todos os textos já foram importados. As capturas antigas ainda registram, em vários casos, uma URL anterior da Câmara dos Deputados. Elas não devem ser declaradas sincronizadas com o Planalto.

A recaptura foi acionada pelo workflow **Monitorar legislação** após a alteração do catálogo. A confirmação deverá ser feita norma por norma comparando `source_url_used` do snapshot com a URL preferencial do catálogo, validando a identidade da norma e a quantidade esperada de dispositivos. Uma falha de acesso ou desafio antirobô deve manter a captura anterior preservada e a norma pendente/bloqueada; não se deve substituir o texto por uma página de erro.

O parser do monitor remove elementos HTML `del`, `s` e `strike` antes de dividir os artigos. Essa limpeza é necessária porque textos compilados do Planalto podem exibir redações antigas riscadas junto da redação vigente.

### Fontes especiais com impedimento conhecido

- IN 128/2022: o Portal IN oficial informa atualização até a IN PRES/INSS nº 212/2026 (última modificação indicada em 12/08/2026). O texto integral ainda precisa ser extraído por artigo e limpo de redações riscadas/revogadas. Enquanto isso, continua bloqueada para leitura ativa e geração de questões.
- Decreto 6.214/2007: URL compilada oficial configurada, mas a consulta automatizada pode encontrar bloqueio. A captura atual é antiga e não está liberada.
- Lei 10.779/2003 compilada: o Planalto indica uma versão compilada, mas a requisição automatizada retornou bloqueio. Manter pendente até receber texto oficial completo.

## Matérias fora da Lei Seca

Português, Informática e Raciocínio Lógico foram incluídos no mapa de disciplinas, mas não devem ser convertidos em artigos de lei. O mesmo vale para teoria geral de Direito Administrativo e para os temas “servidor como agente de desenvolvimento social” e “saúde e qualidade de vida no serviço público”. O mapa identifica o que falta produzir, sem fingir que já existem aulas ou bancos completos.

## Situação que ainda exige conclusão

- Confirmar a recaptura direta do Planalto para cada uma das normas do catálogo.
- Desbloquear somente as normas cuja captura oficial esteja íntegra, sem mistura de redações antigas.
- Concluir a revisão temática dos dispositivos da Lei 8.213/1991 e do Decreto 3.048/1999; são núcleos extensos e não devem ser tratados como definitivamente auditados apenas por terem uma lista de artigos.
- Recapturar integralmente a IN 128/2022 e o Decreto 6.214/2007.
- Revalidar ou regenerar as questões cujo hash mudar após a recaptura oficial.
- Produzir os materiais e bancos próprios de Português, Informática, Raciocínio Lógico e dos tópicos teóricos não legislativos.
- Confirmar os testes de qualidade e a publicação depois do último commit.

## Critério para considerar uma norma concluída

Uma norma só poderá receber estado “sincronizada/liberada” quando:
1. `source_url_used` corresponder à URL oficial preferencial;
2. o texto recebido for a norma correta, e não uma página de desafio/bloqueio;
3. a captura estiver completa, sem perda inesperada de artigos;
4. redações revogadas ou riscadas estiverem excluídas do conteúdo de estudo;
5. a lista ativa de artigos corresponder aos assuntos do edital;
6. questões vinculadas aos dispositivos forem novamente validadas por hash e trecho-âncora.

**Estado geral:** avanço realizado e mudanças salvas, mas o pente-fino completo e a sincronização de todas as fontes ainda não podem ser declarados concluídos.


## Continuação do trabalho — 15/11/2026

### Recaptura automática das fontes oficiais

A recaptura das 28 normas foi executada. O resultado foi **0/28 fontes com texto íntegro**:
- As URLs do Planalto redirecionaram o monitor para a página institucional genérica `https://www.gov.br/planalto/pt-br`, sem entregar o conteúdo da lei/decreto.
- O Portal IN da IN 128/2022 retornou resposta com menos de 350 caracteres úteis.
- O monitor rejeitou essas respostas e preservou os snapshots anteriores. Nenhum texto de bloqueio foi aceito como lei.

O código do monitor foi ajustado para reconhecer o redirecionamento genérico do Planalto como bloqueio, e o workflow foi alterado para salvar `data/legislacao.json` com os diagnósticos mesmo quando todas as fontes falham. Assim, o painel pode exibir o estado real, sem substituir as capturas por páginas vazias ou desafios.

### Proteção dos estudos

Como nenhuma captura antiga foi confirmada diretamente nas fontes preferenciais:
- As 28 normas receberam `study_blocked: true`.
- A biblioteca não exibe os artigos das capturas antigas para estudo.
- Os bancos armazenados continuam preservados para auditoria, mas o aplicativo suspende a execução deles até a norma ficar sincronizada.
- Os modos C/E, Completar Lei Seca, Encontre o Erro, Descubra o Artigo, Várias Afirmações, Antes e Depois e Memorização Ativa passaram a exigir uma captura cujo endereço de origem corresponda exatamente à fonte preferencial e cuja norma esteja marcada como sincronizada e validada.
- Contagem gravada nos bancos: 151 C/E, 61 Encontre o Erro, 43 Descubra o Artigo e 43 grupos de afirmações. Contagem liberada para treino neste momento: zero, por segurança da fonte.

Essa suspensão é temporária e conservadora. Os arquivos JSON não foram apagados; os textos antigos permanecem apenas para comparação e auditoria.

### Ajustes no recorte do edital

- Lei 8.112/1990: o recorte foi corrigido para incluir também os arts. 143 a 182, que tratam de sindicância, apuração e processo administrativo disciplinar. A lista passou a 176 dispositivos, mantendo os blocos de provimento, vacância, movimentação, direitos e vantagens, deveres, responsabilidades e regime disciplinar.
- Lei 8.429/1992: incluído o art. 23-B junto aos arts. 23-A e 23-C, mantendo fora os dispositivos finais de vigência/revogação.
- Decreto 8.424/2015: incluído o art. 9º, que altera o RPS em matéria relacionada ao pescador artesanal; excluído o art. 12, regra transitória para períodos de defeso iniciados até 31/03/2015; art. 10 revogado permanece fora.
- Questão `8212-art10-financiamento-01`: arquivada por divergência entre o hash e a redação armazenada.

### Matérias não previdenciárias

O arquivo `data/edital-materias.json` contém 13 blocos de matéria, e a área **Estudar** agora mostra o mapa das 13 áreas/disciplinas do edital. Português, Informática e Raciocínio Lógico aparecem separadamente, assim como Constitucional, Administrativo e Ética. O mapa mostra o status real: conteúdo teórico/bancos dessas disciplinas ainda não foram produzidos integralmente.

### Testes

A suíte E2E foi ajustada para testar o estado correto enquanto as fontes estão bloqueadas: a biblioteca e os modos legislativos devem impedir o estudo de capturas antigas. O validador de bancos já passou depois da suspensão da questão da Lei 8.212. A publicação do Pages e os testes da última revisão ainda precisam ser conferidos no commit mais recente.

## O que ainda depende de acesso oficial

1. Obter resposta íntegra do Planalto para as 27 normas legais/constitucionais e do Portal IN para a IN 128. Enquanto houver bloqueio antirobô, não marcar como sincronizada.
2. Importar as versões compiladas, retirar visualmente as redações riscadas/revogados e salvar snapshots completos apenas quando validados.
3. Depois da importação, revisar a correspondência de artigos e subdispositivos, principalmente Lei 8.213/1991, Lei 8.212/1991 e Decreto 3.048/1999.
4. Revalidar ou recriar cada questão pela redação oficial. Só então reabrir os bancos.
5. Criar o conteúdo teórico e os bancos de questões de Português, Informática, Raciocínio Lógico e demais blocos teóricos não legislativos.
6. Confirmar o resultado dos testes E2E, validação de dados e publicação da versão mais recente.

**Não declarar a auditoria completa enquanto a recaptura oficial não for concluída.**
