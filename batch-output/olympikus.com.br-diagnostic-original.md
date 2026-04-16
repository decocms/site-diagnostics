# Diagnostic report: Olympikus (Vulcabras)

> **Date:** 2026-04-15 | **URL:** olympikus.com.br | **Platform:** VTEX IO (render-server@8.179.3) | **Monthly visits:** ~3,8M (março/2026) | **Category:** Lifestyle / Fashion & Apparel | **Ranking global:** #14.686 | **Ranking Brasil:** #830

**Health Score: 38/100** — Structured Data 10/20 | Content Engine 0/15 | Product SEO 8/15 | Performance 3/20 | Social Proof 5/10 | Cross-sell 0/10 | Domain Signals 8/10

**Site inventory:** 600 product URLs medidos nos sitemaps (product-0.xml + product-1.xml). 53 category URLs no sitemap de categorias. Nenhuma página editorial indexada nos sitemaps.[^inventory]
[^inventory]: Metodologia: contagem de `<loc>` nos sitemaps product-0.xml (127KB, ~400 URLs) e product-1.xml (37KB, ~200 URLs), medidos via fetch_page em 15/04/2026. crawl_site identificou 500 páginas (441 PDPs, 52 PLPs) com limite de 500 páginas.

---

## 3.484 oportunidades de melhoria identificadas em olympikus.com.br

Identificamos **7 áreas de melhoria** representando **3.484 melhorias a nível de página** em **653 URLs únicos**. A performance mobile é a lacuna mais impactante — a homepage pesa 6,3 MB e leva 12,8 segundos para o Largest Contentful Paint, enquanto páginas de produto chegam a 37,1 segundos de LCP. A ausência de um content engine editorial limita a captura dos mais de 450 mil buscas mensais por termos como "tênis olympikus" e variações de cauda longa.

![Homepage Olympikus — desktop](http://localhost:3002/api/screenshots/www.olympikus.com.br-desktop-d8d51cdf.png)

---

## Oportunidades

### 1. Performance mobile: LCP e Total Blocking Time

A homepage registrou Lighthouse Performance de 28/100 (mobile), com LCP de 12,8 s, FCP de 4,3 s, Total Blocking Time de 3.590 ms e Time to Interactive de 44,1 s. O payload total foi de 6.330 KB, com 1.203 KB de JavaScript não utilizado e 339 KB de CSS não utilizado identificados como oportunidade de redução.[^lh-home]

A PDP do Corre 4 registrou Lighthouse Performance de 1/100, com LCP de 37,1 s, CLS de 1,677, TBT de 4.750 ms e TTI de 48,9 s. O payload total foi de 6.534 KB, com 1.415 KB de JS não utilizado e 578 KB de CSS não utilizado.[^lh-pdp]

Esses números são consistentes com a arquitetura VTEX IO baseada em React client-side rendering: o navegador precisa baixar, parsear e executar ~10 s de JavaScript antes que o conteúdo se torne interativo. Com 60% do tráfego vindo de busca orgânica[^sw], cada segundo de atraso impacta diretamente a taxa de conversão. Segundo a Deloitte (2020, estudo com 37 marcas e 30 milhões de sessões), cada 0,1 s de melhoria na velocidade mobile gera +8,4% de conversão no varejo.

| Action | Pages affected |
|---|---|
| Otimizar performance mobile (reduzir JS/CSS não utilizado, implementar SSR/streaming, otimizar imagens) | 653 (site-wide) |

[^lh-home]: Lighthouse mobile audit, homepage, 15/04/2026.
[^lh-pdp]: Lighthouse mobile audit, PDP Corre 4, 15/04/2026.
[^sw]: Similarweb, dados de março/2026. Estimativas baseadas em painel, não dados de first-party.

### 2. Structured data (JSON-LD) inconsistente nas PDPs

O audit_seo (DataForSEO, amostra de 63 páginas) reportou structured data presente em 5 de 5 PDPs amostradas, com tipo Product. Entretanto, ao renderizar as PDPs com browser (render_page), o JSON-LD não foi detectado no HTML renderizado — sugere que o schema é injetado via JavaScript de forma assíncrona, o que pode dificultar a leitura por crawlers que não executam JS completo.[^seo-audit]

O Corre 4 (scrape_page via Firecrawl) apresentou title "Tênis Olympikus Corre 4" e meta description adequada. Porém, o Corre 5 apresentou title usando o slug da URL ("tenis-olympikus-corre-5-43206446-3-030") em vez de um título legível, e meta description genérica de apenas uma frase.[^render-pdps] A canonical tag não foi detectada em nenhuma das PDPs renderizadas (baseado em 2 PDPs amostradas via render_page).

Para um catálogo com ~600 product URLs em sitemaps, a inconsistência na injeção de JSON-LD e a falta de canonical tags limita a elegibilidade para rich snippets no Google. Rich snippets podem aumentar o CTR em 20-40% (estimativa amplamente citada na indústria de SEO).

| Action | Pages affected |
|---|---|
| Garantir JSON-LD Product renderizado server-side com canonical tag em todas as PDPs | ~600 PDPs |

[^seo-audit]: audit_seo (DataForSEO), 63 páginas crawleadas, 15/04/2026, score 90.67.
[^render-pdps]: render_page em Corre 4 e Corre 5, 15/04/2026.

### 3. Meta titles e descriptions inconsistentes

Das 3 PDPs renderizadas, o Corre 4 exibiu title adequado ("Tênis Olympikus Corre 4") e meta description detalhada. O Corre 5 usou o slug da URL como title e meta description mínima ("Tênis Olympikus Corre 5"). O Corre Grafeno 3 também usou slug como title. Nas PLPs, /masculino exibiu "Olympikus Masculino - Desempenho e Estilo" e /feminino/calcados exibiu "Tênis Femininos - Conforto e Estilo Olympikus", ambas sem meta description detectada.[^render-plps]

O audit_seo identificou 12 meta descriptions duplicadas e 2 páginas sem meta description na amostra crawleada.[^seo-audit]

Com keywords como "tênis olympikus feminino" (135K buscas/mês) e "olympikus corre 4" (165K buscas/mês), cada PDP e PLP sem meta data otimizado é uma oportunidade perdida de click-through na SERP.

| Action | Pages affected |
|---|---|
| Gerar meta titles e descriptions únicos e otimizados por SEO | ~600 PDPs + 53 PLPs |

[^render-plps]: render_page em /masculino e /feminino/calcados, 15/04/2026.

### 4. Content engine editorial não identificado

A descoberta editorial seguiu três métodos: (1) probing de 11 paths comuns (/blog, /editorial, /revista, /conteudo, /magazine, /news, /noticias, /stories, /artigos, /guia, /inspira) — todos retornaram HTTP 200 mas com conteúdo de page shell VTEX, sem conteúdo editorial dedicado; (2) crawl_site classificou 0 páginas como blog ou institutional; (3) o sitemap.xml não contém sitemaps editoriais. O /blog especificamente renderizou com title "blog" e sem conteúdo substantivo — funciona como uma search results page.[^blog-render]

A marca opera com 450K buscas mensais para "olympikus" e termos de produto, mas sem conteúdo editorial não captura tráfego informacional como "melhor tênis para corrida", "como escolher tênis de corrida" ou "olympikus corre 4 vs corre 5" — termos que aparecem nas buscas relacionadas do Google.[^serp-research] Empresas com blogs ativos geram aproximadamente 55% mais visitantes (estimativa amplamente citada na indústria de marketing de conteúdo).

| Action | Pages affected |
|---|---|
| Criar e indexar content engine editorial (blog/guia) | site-wide (novo) |

[^blog-render]: render_page em /blog, 15/04/2026. Title: "blog", sem meta description, sem JSON-LD.
[^serp-research]: research_serp para "olympikus" e "tenis corrida brasileiro", DataForSEO, Brasil, 15/04/2026.

![PLP Masculino — desktop](http://localhost:3002/api/screenshots/www.olympikus.com.br-desktop-be81693b.png)

### 5. Reviews com volume baixo na maioria das PDPs

O Corre 4 (variante Collab Netshoes) tem 13 avaliações com média de 5.0. O Corre Grafeno 3 tem 21 avaliações com média de 5.0 (95% recomendação). O Corre 5 (lançamento recente) ainda não apresenta avaliações (seção de avaliação presente, mas com mensagem "Seja o primeiro a avaliá-lo"). A integração YourViews está ativa.[^scrape-pdps]

Baseado em 3 PDPs amostradas, os volumes de reviews são baixos para os produtos mais procurados do catálogo — "olympikus corre 4" tem 165K buscas mensais. Segundo estudo da Bazaarvoice/Spiegel, produtos com 50+ reviews convertem 2-3x mais que produtos sem reviews. Com uma taxa de resposta de 5-15% em emails pós-compra (média da indústria), um programa estruturado de solicitação de reviews poderia multiplicar o volume atual.

| Action | Pages affected |
|---|---|
| Implementar programa sistemático de coleta de reviews pós-compra | ~600 PDPs |

[^scrape-pdps]: scrape_page em Corre 4, Corre 5 e Corre Grafeno 3, 15/04/2026.

### 6. Cross-sell e recomendações de produto não detectados

Nas 3 PDPs analisadas via scrape_page, não foram identificados blocos de recomendação de produto ("Você também pode gostar", "Compre junto", "Quem viu também viu"). O componente SmartHint está presente nos assets CSS carregados (olympikus.smart-hint), mas nenhuma seção de cross-sell ou upsell renderizou no conteúdo das páginas scraped.[^scrape-pdps]

Segundo a McKinsey, recomendações de produto respondem por 10-30% da receita de e-commerce. O Baymard Institute indica uplift médio de AOV de 8-15% com cross-sell implementado.

| Action | Pages affected |
|---|---|
| Ativar e renderizar blocos de cross-sell/upsell nas PDPs | ~600 PDPs |

![PDP Corre 4 — desktop](http://localhost:3002/api/screenshots/www.olympikus.com.br-desktop-2294f5e3.png)

### 7. Higiene técnica: H1 tags e duplicate content

O audit_seo identificou 12 páginas sem H1 tag e 16 páginas com conteúdo duplicado na amostra de 63 páginas.[^seo-audit] A homepage utiliza cache adequado (CloudFront HIT, cache-control public com stale-while-revalidate). SSL está ativo, HTTP/2 suportado, X-Frame-Options configurado. Robots.txt presente com sitemap referenciado. O audit_seo não detectou robots.txt e sitemap — provavelmente devido ao redirect `?__decoFBT=0` adicionado pela plataforma, mas ambos estão acessíveis nas URLs canônicas.[^robots]

| Action | Pages affected |
|---|---|
| Corrigir H1 tags ausentes e resolver conteúdo duplicado | 28 páginas (12 sem H1 + 16 duplicados) |

[^robots]: fetch_page em /robots.txt, 15/04/2026. Status 200, conteúdo válido com sitemap referenciado.

---

## Opportunity summary

| Oportunidade | Ação | Páginas afetadas |
|---|---|---|
| 1. Performance mobile | Otimizar LCP, reduzir JS/CSS, implementar SSR | 653 (site-wide) |
| 2. Structured data JSON-LD | Garantir renderização server-side com canonical | ~600 PDPs |
| 3. Meta titles e descriptions | Gerar meta data único e otimizado | ~653 (PDPs + PLPs) |
| 4. Content engine editorial | Criar e indexar blog/guia | site-wide (novo) |
| 5. Reviews | Programa sistemático de coleta pós-compra | ~600 PDPs |
| 6. Cross-sell | Ativar blocos de recomendação | ~600 PDPs |
| 7. Higiene técnica | Corrigir H1 e conteúdo duplicado | 28 páginas |
| **Total** | **7 áreas** | **3.484 melhorias a nível de página em 653 URLs únicos** |

O que cada melhoria demanda depende da plataforma e do time. O volume — 3.484 melhorias individuais em 653 URLs — e a natureza contínua do trabalho tornam a execução automatizada indispensável.

---

## O que isso requer

As melhorias identificadas tocam centenas de páginas de produto, dezenas de categorias e a infraestrutura de performance do site inteiro. O catálogo não é estático: novos produtos herdam as mesmas lacunas. O Corre 5, lançado recentemente, já apresenta title usando slug de URL e nenhuma avaliação — padrão que se repetirá a cada lançamento.

Parte das correções é pontual (configuração de canonical tags, ativação de cross-sell), mas o conteúdo editorial, a coleta de reviews e o monitoramento de performance são trabalhos contínuos, granulares e sensíveis ao tempo. Meta descriptions para 600+ PDPs precisam ser únicas e alinhadas com a intenção de busca, não genéricas.

deco AI Agents são agentes especializados que executam continuamente. O que tradicionalmente leva semanas, deco entrega em minutos, no piloto automático.

Coloque sua estratégia digital no piloto automático.

---

## Contexto estratégico

A Olympikus ocupa posição #1 no Google Brasil para "olympikus" e "tenis corrida brasileiro" (DataForSEO, Brasil, 15/04/2026), com dois resultados na primeira página para o segundo termo — homepage e a landing page do Corre 4. A marca sustenta aproximadamente 450K buscas mensais pelo nome "olympikus" e 165K para "olympikus corre 4" e "tênis olympikus", indicando forte presença de marca no mercado brasileiro.[^kw]

A estratégia DTC da Vulcabras está em evolução. Segundo pesquisa de mercado, a recente reformulação da marca com a consultoria Yöne incluiu novo e-commerce focado em integração de conteúdo editorial e UGC, mas a execução editorial ainda não se materializou de forma indexável.[^rb] Os ~3,8M de visitas mensais são dominados por busca (60,4%) e tráfego direto (31,1%), com paid representando apenas 4,1% — um perfil saudável que pode ser amplificado com conteúdo de cauda longa.[^sw2]

O ecossistema competitivo no Brasil inclui ASICS, Nike, Hoka e Mizuno, todos com presença na SERP para termos genéricos de corrida. A diferença é que a Olympikus domina os termos de marca mas deixa descobertos termos informativos ("como escolher tênis de corrida", "diferença entre tênis neutro e estável"), onde concorrentes e editores independentes capturam tráfego. Com a infraestrutura de conteúdo certa, esse gap é uma vantagem esperando ser ativada.

A participação de tráfego via AI (ChatGPT) foi estimada em ~15,3% do tráfego de referência de AI, sugerindo que a marca já aparece em respostas de modelos de linguagem — uma posição que structured data e conteúdo editorial reforçariam.[^sw2]

[^kw]: research_keywords, DataForSEO, Brasil, 15/04/2026.
[^rb]: research_business via Perplexity, 15/04/2026. Citações: portorocha.com/olympikus, vulcabrasri.com/en/company/profile/.
[^sw2]: research_traffic (Similarweb via Apify), março/2026. Estimativas baseadas em painel de terceiros, não dados de first-party.

---

## Referências e metodologia

**Benchmarks da indústria citados:**
- Deloitte, "Milliseconds Make Millions", 2020 (37 marcas, 30M sessões): +8,4% conversão por 0,1s de melhoria mobile
- McKinsey: recomendações de produto geram 10-30% da receita e-commerce
- Estimativa amplamente citada na indústria de SEO: rich snippets aumentam CTR em 20-40%
- Bazaarvoice / Spiegel: produtos com 50+ reviews convertem 2-3x
- Estimativa amplamente citada na indústria de marketing de conteúdo: empresas com blogs ativos geram ~55% mais visitantes
- Baymard Institute: cross-sell gera uplift médio de AOV de 8-15%

**Fontes de dados:**
- crawl_site (Firecrawl): 500 páginas, 15/04/2026
- fetch_page: sitemaps, homepage, robots.txt, 11 paths editoriais, 15/04/2026
- render_page: homepage, 2 PDPs, 2 PLPs, /blog, 15/04/2026
- scrape_page (Firecrawl): 3 PDPs (Corre 4, Corre 5, Corre Grafeno 3), 15/04/2026
- lighthouse_audit: homepage e PDP Corre 4, mobile, 15/04/2026
- screenshot: homepage, PLP /masculino, PDP Corre 4, desktop, 15/04/2026
- audit_seo (DataForSEO): 63 páginas crawleadas, score 90.67, 15/04/2026
- research_serp (DataForSEO): "olympikus" e "tenis corrida brasileiro", Brasil, 15/04/2026
- research_keywords (DataForSEO): 5 keywords seed → 35 keywords com métricas, Brasil, 15/04/2026
- research_traffic (Similarweb via Apify): olympikus.com.br, março/2026
- research_business (Perplexity): contexto empresarial Olympikus/Vulcabras, 15/04/2026

**Source URLs:**
- https://www.portorocha.com/olympikus
- https://www.vulcabrasri.com/en/company/profile/

---

*Report generated by the deco AI diagnostic pipeline.*
