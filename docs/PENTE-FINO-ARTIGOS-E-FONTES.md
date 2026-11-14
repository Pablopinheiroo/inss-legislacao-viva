
# Pente-fino legislativo — edital INSS 2022

## Situação atual

O filtro por artigo foi aplicado às normas cadastradas e aos quatro bancos de treinamento. Foram incluídas as matérias de Constitucional, Administrativo e Ética, além de Previdenciário. Português, Informática, Raciocínio Lógico e blocos teóricos estão identificados para módulos próprios.

O conteúdo ativo está recortado com base nos itens 14.2.2 e 14.2.3 do Edital INSS 2022. O filtro exclui artigos fora dos tópicos do edital, dispositivos formais de vigência/revogação, prazos transitórios já encerrados e dispositivos inteiramente revogados identificados.

## Bancos de questões — quantidade atual

| Banco | Itens/grupos ativos | Removidos desde a base original |
|---|---:|---:|
| Certo ou Errado | 152 | 17 |
| Encontre o Erro | 61 | 13 |
| Descubra o Artigo | 43 | 22 |
| Afirmações por artigo | 43 grupos | 5 |

No modo Descubra o Artigo, além do artigo-resposta, as quatro alternativas precisam estar dentro do recorte do edital. Isso explica parte das exclusões.

## Fontes oficiais

O catálogo prioriza endereços diretos do Planalto, usando texto compilado/consolidado quando disponível. O Código Penal usa a versão compilada do Planalto. A IN 128/2022 usa o Portal IN oficial do INSS, por ser ato normativo interno.

Algumas páginas do Planalto foram confirmadas em buscas oficiais, inclusive Lei 8.112 compilada, Lei 8.429 compilada, Lei 9.784, Decreto 6.214 compilado e LC 142. Contudo, a existência do link não significa que o snapshot do projeto já veio dessa página.

A origem efetiva de cada captura é preservada em `source_url` / `source_url_used`. O link de destino preferencial fica em `preferred_source_url` / `laws.json.url`. Não se altera a origem histórica para fingir que a recaptura ocorreu.

## Normas que permanecem bloqueadas

- **IN 128/2022:** a captura existente é só um índice de alterações, sem artigos. A página oficial mostra alterações sucessivas e redações riscadas; a importação integral e a limpeza são pendentes.
- **Decreto 6.214/2007:** a captura antiga mistura o decreto de aprovação com o Anexo do BPC e contém redações revogadas e modificações posteriores ao edital. O texto compilado do Planalto foi localizado; a leitura e a nova captura limpa ainda não foram validadas.
- **Código Penal:** arts. 168-A e 337-A foram vinculados ao tópico “crimes contra a Seguridade Social”, mas a captura direta compilada ainda não foi concluída. Não gerar questões até a validação e separação das alterações posteriores a 2022.

## Revisões feitas nesta etapa

- **Decreto 6.029/2007:** retirado o art. 25, que contém revogações formais; ficam os arts. 1º a 24.
- **Lei 8.112/1990:** recorte ampliado para o regime de provimento, vacância, remoção, redistribuição, substituição, direitos, vantagens, disciplina e responsabilidade; artigos integralmente revogados foram retirados. Alguns artigos não aparecem na captura antiga e aguardam recaptura.
- **Lei 13.985/2020:** incluído o art. 4º, que trata da operacionalização da pensão especial pelo INSS e Dataprev.
- **LOAS:** estudo recortado para BPC e auxílio-inclusão. O art. 20-B foi separado do art. 20-A revogado. Arts. 40-B e 40-C foram mantidos por conexão direta com BPC e dívidas do benefício. O art. 26-G, de natureza orçamentária, foi excluído.
- **Lei 9.796/1999:** excluído o art. 5º, que previa prazo transitório já encerrado, e os dispositivos finais.
- **Decreto 10.188/2019:** mantidos os arts. 1º a 24; excluídos prazos transitórios encerrados, revogação e vigência.
- **EC 103/2019:** mantidos os arts. 1º a 31; excluídos os arts. 32 e 33 por tratarem de assuntos fora do recorte do edital, além das cláusulas finais.
- **LC 142/2013:** mantidos os arts. 1º a 10, que contêm regras materiais sobre aposentadoria da pessoa com deficiência; retirado o art. 11, de vigência.

## Outros componentes do edital

- Constitucional: direitos fundamentais, direitos sociais, nacionalidade/cidadania, Administração Pública e Seguridade Social.
- Administrativo: Lei 8.112, Lei 8.429, Lei 9.784; organização administrativa, poderes, atos, serviços, controles e responsabilidade também exigem teoria própria.
- Ética: Decreto 1.171/1994 e Decreto 6.029/2007. O art. 3º do Decreto 1.171 foi mantido porque o parser da captura guarda o Anexo do Código de Ética dentro dessa entrada.
- Português, Informática e Raciocínio Lógico: módulos teóricos, não Lei Seca.
- Agente de desenvolvimento social, saúde e qualidade de vida no serviço público, e fundamentos de legislação previdenciária: blocos teóricos.

## O que falta para dar como concluído

1. Aguardar e validar o monitor automático para recapturar diretamente do Planalto todas as normas que ainda vieram de outra fonte.
2. Conferir cada captura depois da recaptura, especialmente trechos revogados/riscados, alterações parciais e dispositivos incluídos depois de 15/09/2022.
3. Reimportar e limpar integralmente a IN 128/2022.
4. Reimportar e limpar Decreto 6.214/2007 e Código Penal.
5. Rodar e aprovar os testes de banco de questões, qualidade do site e publicação.

**Não considerar o projeto integralmente sincronizado com o Planalto até que `source_url_used` corresponda à fonte preferencial e os hashes dos dispositivos sejam conferidos.**
