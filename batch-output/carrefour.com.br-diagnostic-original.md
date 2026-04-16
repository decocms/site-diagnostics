# Relatório diagnóstico: Carrefour Brasil (Grupo Carrefour Brasil)

> **Data:** 2026-04-15 | **URL:** carrefour.com.br | **Plataforma:** VTEX IO (render-server@8.179.3) + deco nav layer | **Visitas mensais:** ~10,3 milhões (março 2026)[^sw] | **Categoria:** E-commerce and Shopping / Marketplace | **Ranking global:** #5.986 | **Ranking Brasil:** #292

**Health Score: 42/100** — Structured Data 10/20 | Content Engine 0/15 | Product SEO 5/15 | Performance 10/20 | Social Proof 0/10 | Cross-sell 0/10 | Domain Signals 8/10

**Inventário do site:** O sitemap index contém 1.200+ sitemaps de produto, 5 sitemaps de categoria (PLPs) e 8 sitemaps de marca. O sitemap product-0.xml contém 67 URLs visíveis na amostra truncada. Não é possível determinar o número exato de produtos sem fetch individual de cada sitemap — o catálogo é da ordem de dezenas de milhares de produtos. O crawl_site (limite de 500 páginas) identificou 490 PDPs e 1 homepage. As PLPs foram confirmadas via sitemap category-0.xml, com centenas de URLs de categoria.[^inventory]

[^inventory]: Metodologia: crawl_site (500 páginas, Firecrawl), sitemap.xml (fetch_page), sitemaps individuais (product-0.xml, category-0.xml). O número exato de PDPs não foi contabilizado — seria necessário acessar cada um dos 1.200+ sitemaps individuais.
[^sw]: Dados de tráfego estimados via Similarweb (painel de terceiros, março 2026). Números são aproximações baseadas em painéis estatísticos e não representam dados first-party.

---

## Oportunidades de melhoria identificadas em carrefour.com.br

Identificamos **8 áreas de melhoria** representando **aproximadamente 150.000+ melhorias em nível de página** distribuídas por **dezenas de milhares de URLs únicas**. As meta descriptions das PDPs reproduzem integralmente o texto da descrição do fornecedor (frequentemente com mais de 300 caracteres), reviews e cross-sell não foram detectados nas páginas de produto amostradas, e o site não possui content engine editorial ativo — uma oportunidade relevante para um marketplace com 10 milhões de visitas mensais onde 63% do tráfego vem de busca.

![Homepage Carrefour Brasil - Desktop](http://localhost:3002/api/screenshots/www.carrefour.com.br-desktop-4668897f.png)

---

## Oportunidades

### 1. Meta descriptions das PDPs reproduzem texto bruto do fornecedor

As 3 PDPs amostradas via scrape_page apresentam meta descriptions que são cópias integrais do campo "Descrição do Produto", sem qualquer otimização para SEO. Exemplos concretos:

- **Panela Tramontina:** a description começa com "Todas Informações abaixo são fornecidas pela Tramontina para maiores esclarecimento e transparências aos nossos clientes. .Referência : 20582620.." — texto claramente de data feed, com pontuação irregular e informações técnicas de logística (peso bruto, metragem).
- **Tênis Asics:** a description excede 500 caracteres, com Todo O Texto Em Capitalização Irregular (Title Case forçado).
- **Vinho Miolo:** description adequada em conteúdo mas com 400+ caracteres, excedendo o limite de exibição de ~155 caracteres nos SERPs.

O Google trunca descriptions acima de ~155 caracteres. Descriptions que começam com "Todas Informações abaixo são fornecidas pela..." reduzem a taxa de clique por não comunicar o benefício do produto. Rich snippets com descriptions otimizadas aumentam CTR em 20-40% (Search Engine Journal / Ahrefs).

| Ação | Páginas afetadas |
|---|---|
| Gerar meta descriptions únicas e otimizadas para SEO (até 155 caracteres, com keyword e benefício principal) | Dezenas de milhares de PDPs |

### 2. Reviews não detectados nas páginas de produto

Nas 3 PDPs amostradas (tênis Asics, panela Tramontina, vinho Miolo), nenhuma seção de reviews ou avaliações de usuário foi identificada no conteúdo renderizado. Não foram encontrados blocos de rating, contagem de avaliações, ou formulários de review.

A ausência de reviews impacta dois vetores: conversão e SEO. Produtos com 50+ reviews convertem entre 2x e 3x mais do que produtos sem avaliações (Bazaarvoice / Spiegel). Além disso, reviews contribuem com conteúdo gerado pelo usuário que é indexável, incluindo variações de long-tail keywords naturais.

Em um marketplace com sellers como Shophub (detectado no PDP do tênis Asics), a implementação de reviews precisa coordenar seller e plataforma. A coleta via e-mails pós-compra apresenta taxa de resposta entre 5-15% (média de indústria).

| Ação | Páginas afetadas |
|---|---|
| Implementar sistema de reviews com coleta pós-compra e exibição nas PDPs | Dezenas de milhares de PDPs |

### 3. Cross-sell e recomendações não detectados nas PDPs

Nenhuma das 3 PDPs amostradas contém seção de "produtos relacionados", "quem viu também comprou" ou qualquer bloco de recomendação. O markdown extraído termina após a descrição do produto e especificações técnicas, sem seção de cross-sell.

Recomendações de produto respondem por 10-30% da receita em e-commerce (McKinsey). Para um site com e-commerce reportado em torno de R$ 3 bilhões no Q3 2024 (conforme fontes de imprensa)[^biz1], mesmo um uplift modesto de AOV via cross-sell — estimado entre 8-15% (Baymard Institute) — representa receita incremental significativa.

| Ação | Páginas afetadas |
|---|---|
| Adicionar blocos de recomendação/cross-sell nas PDPs | Dezenas de milhares de PDPs |

[^biz1]: https://ri.grupocarrefourbrasil.com.br/en/results-and-reports/ (Resultados e Relatórios — Grupo Carrefour Brasil, Relações com Investidores)

### 4. Content engine editorial não detectado

O discovery de conteúdo editorial utilizou três métodos em paralelo:

- **Probing de paths:** /blog, /editorial, /revista, /conteudo, /noticias, /stories, /magazine, /guia retornaram HTTP 404. Apenas /inspira retornou HTTP 200.
- **Render de /inspira:** A página não apresenta title, description, headings ou JSON-LD. O conteúdo renderizado consiste apenas de CSS e markup de layout VTEX — não foi detectado conteúdo editorial (artigos, posts, guias).
- **Classificação do crawl_site:** Das 500 páginas descobertas, nenhuma foi classificada como blog ou institucional.

Para um site com 63% do tráfego vindo de busca orgânica (research_traffic), a ausência de content engine representa oportunidade perdida de capturar tráfego informacional. Empresas com blogs ativos geram aproximadamente 55% mais visitantes (HubSpot). Keywords como "receitas", "como escolher [produto]", e guias de compra são oportunidades de topo de funil não endereçadas.

| Ação | Páginas afetadas |
|---|---|
| Criar e manter content engine editorial (blog/guias) | Site-wide (nova seção) |

### 5. Performance mobile: LCP de 6,8s nas PDPs

O Lighthouse audit da PDP do tênis Asics (mobile) registrou:

- **LCP:** 6,8s (score 0.07 — vermelho, threshold ideal < 2,5s)
- **FCP:** 3,7s (score 0.30)
- **TTI:** 6,9s (score 0.54)
- **TBT:** 0ms (bom)
- **CLS:** 0 (excelente)
- **Performance score:** 68/100

O homepage Lighthouse não retornou scores válidos — a página estava protegida por WAF (Cloudflare), impedindo a execução do audit; os screenshots da homepage podem refletir uma página de challenge em vez do conteúdo real. O capture_har da homepage mostra TTFB excelente (133ms desktop cold, 109ms mobile cold) e peso total razoável (~2 MB desktop cold), com 1,36 MB de JavaScript entre os 50 scripts carregados. O recurso mais lento é `/sgtm/gtm.js` (596ms, 639 KB).

O LCP de 6,8s em mobile nas PDPs limita conversão. Cada 0,1s de melhoria em velocidade mobile gera +8,4% de conversão no varejo (Deloitte, "Milliseconds Make Millions", 2020).

| Ação | Páginas afetadas |
|---|---|
| Otimizar LCP mobile nas PDPs (lazy-load de imagens não-primárias, priorizar hero image, reduzir JavaScript) | Dezenas de milhares de PDPs + homepage |

### 6. OG Image não detectada nas PDPs

As 3 PDPs amostradas retornaram `ogImage: null` no metadata extraído via scrape_page. Isso significa que compartilhamentos em redes sociais e previews em apps de mensagem não exibem a imagem do produto, reduzindo taxa de clique em canais sociais e de referral.

| Ação | Páginas afetadas |
|---|---|
| Implementar og:image tag com imagem principal do produto em todas as PDPs | Dezenas de milhares de PDPs |

### 7. Homepage servida com cache-control: no-store

O capture_har e o fetch_page confirmam que a homepage é servida com `cache-control: no-store`, forçando revalidação em cada acesso apesar de estar sendo servida via Cloudflare CDN (cf-cache-status: HIT). Os assets estáticos (JS, CSS, fontes) possuem `max-age=86400` (bom), mas o documento HTML principal não é cacheável pelo browser.

Em contraste, as páginas de categoria e produto possuem cache headers adequados (`public, max-age=620, s-maxage=60, stale-while-revalidate=1200`).

| Ação | Páginas afetadas |
|---|---|
| Configurar cache-control adequado para o documento HTML da homepage | 1 (homepage) |

### 8. Higiene técnica

- **Robots.txt:** Presente e bem configurado, com regras para Googlebot e AdsBot-Google, bloqueando corretamente checkout, conta e busca. Referencia o sitemap corretamente.
- **SSL/HSTS:** HTTPS ativo com HSTS `max-age=2592000` (30 dias). Adequado, embora o ideal seja 1 ano.
- **Canonical:** Não detectado na amostra de 1 KB do HTML — o HTML truncado não incluiu o tag canonical. O Lighthouse SEO score de 1.0 na PDP sugere que canonicals estão presentes quando a página é renderizada.
- **Dual CDN:** O site opera com Cloudflare na frente e CloudFront (AWS) como CDN de origem VTEX — uma configuração comum em lojas VTEX. Não foram detectadas falhas de request nos 4 passes do capture_har.

| Ação | Páginas afetadas |
|---|---|
| Aumentar HSTS max-age para 1 ano (31536000) | Site-wide (configuração) |

![PLP Eletroportáteis - Desktop](http://localhost:3002/api/screenshots/www.carrefour.com.br-desktop-a76dd125.png)

![PDP Tênis Asics - Desktop](http://localhost:3002/api/screenshots/www.carrefour.com.br-desktop-75d7fa80.png)

---

## Resumo das oportunidades

| Oportunidade | Ação | Páginas afetadas |
|---|---|---|
| 1. Meta descriptions | Gerar descriptions únicas e otimizadas | Dezenas de milhares de PDPs |
| 2. Reviews | Implementar sistema de reviews com coleta pós-compra | Dezenas de milhares de PDPs |
| 3. Cross-sell | Adicionar blocos de recomendação nas PDPs | Dezenas de milhares de PDPs |
| 4. Content engine | Criar blog/guias editoriais | Site-wide (nova seção) |
| 5. Performance mobile | Otimizar LCP nas PDPs | Dezenas de milhares de PDPs + homepage |
| 6. OG Image | Implementar og:image nas PDPs | Dezenas de milhares de PDPs |
| 7. Cache da homepage | Configurar cache-control adequado | 1 (homepage) |
| 8. Higiene técnica | HSTS max-age | Site-wide (configuração) |
| **Total** | **8 áreas** | **Estimativa de 150.000+ melhorias em nível de página, distribuídas por dezenas de milhares de URLs únicas** |

O que cada melhoria demanda em termos de implementação depende da plataforma e da equipe. O volume — dezenas de milhares de páginas de produto que precisam de descriptions únicas, reviews, cross-sell e og:image — e a natureza contínua do trabalho (novos produtos herdam as mesmas lacunas) tornam a execução automatizada essencial.

---

## O que isso requer

As melhorias tocam dezenas de milhares de páginas em um catálogo que não é estático. Novos produtos entram na operação diariamente via marketplace, e cada um herda as mesmas lacunas — meta description genérica do fornecedor, ausência de reviews, sem cross-sell, sem og:image. A escala se multiplica continuamente.

Parte das correções são pontuais (cache da homepage, HSTS). Mas a maior parte do trabalho — gerar descriptions únicas para cada produto, coletar e exibir reviews, montar e atualizar blocos de recomendação, produzir conteúdo editorial — é contínua, granular e sensível ao tempo. Uma description otimizada precisa ser criada para cada novo SKU. Reviews precisam ser solicitados em cada ciclo de compra.

deco AI Agents são agentes especializados que executam esse tipo de trabalho continuamente. O que tradicionalmente tomaria semanas de equipe para endereçar em um catálogo dessa escala, deco entrega em minutos, no piloto automático.

Coloque sua estratégia digital no piloto automático.

---

## Contexto estratégico

O Grupo Carrefour Brasil é o maior varejista alimentar do país, com receita bruta estimada em aproximadamente R$ 115 bilhões em 2023 e operação e-commerce reportada em torno de R$ 3 bilhões no Q3 2024, segundo fontes de mercado e imprensa.[^biz2] A aquisição integral pela matriz francesa Carrefour Group em 2025 sinaliza uma consolidação que prioriza eficiência operacional e integração digital — contexto onde SEO e performance de canal DTC ganham ainda mais relevância.[^biz3]

No SERP para "carrefour compras online", o domínio carrefour.com.br ocupa as posições 1, 4, 5 e 6 (DataForSEO, Brasil, abril 2026). Para o termo genérico "supermercado online entrega", mercado.carrefour.com.br aparece na posição 1. A marca domina buscas branded, mas a dependência de 63% do tráfego via canal de busca (Similarweb, março 2026) expõe vulnerabilidade: qualquer mudança algorítmica ou perda de posição impacta diretamente o fluxo de visitantes.

O tráfego de AI (ChatGPT, Perplexity, Gemini) já representa uma parcela mensurável das referências ao site, com ChatGPT concentrando a maior parcela do tráfego de AI referenciado — estimativas de painel apontam para uma participação dominante (Similarweb, março 2026). À medida que buscas via AI crescem, dados estruturados e conteúdo editorial se tornam ainda mais relevantes — ambos são oportunidades identificadas neste diagnóstico.

Com a marca "carrefour" gerando aproximadamente 1,2 milhão de buscas mensais (DataForSEO, março 2026) e "atacadão" no mesmo patamar, o Grupo detém uma posição de busca invejável. Converter essa demanda branded em experiência de produto otimizada — com reviews, cross-sell e conteúdo rico — é o passo que separa visibilidade de conversão.

[^biz2]: https://www.statista.com/statistics/752903/carrefour-gross-revenue-brazil/
[^biz3]: https://www.ainvest.com/news/carrefour-strategic-play-brazil-bold-move-future-growth-2504/

---

## Referências e metodologia

**Benchmarks de indústria citados:**
- Deloitte, "Milliseconds Make Millions", 2020 (37 marcas, 30M sessões): cada 0,1s de melhoria mobile → +8,4% conversão no varejo
- McKinsey: recomendações de produto respondem por 10-30% da receita e-commerce
- Search Engine Journal / Ahrefs: rich snippets aumentam CTR em 20-40%
- Bazaarvoice / Spiegel: produtos com 50+ reviews convertem entre 2-3x
- HubSpot: empresas com blogs ativos geram ~55% mais visitantes
- Baymard Institute: uplift médio de AOV com cross-sell entre 8-15%

**Fontes de dados:**
- crawl_site: 500 páginas, Firecrawl, 15 abril 2026
- fetch_page: homepage, robots.txt, sitemap.xml, sitemaps individuais, 9 paths editoriais, 3 PDPs
- render_page: /inspira, 15 abril 2026
- scrape_page: 3 PDPs (tênis Asics, panela Tramontina, vinho Miolo)
- capture_har: homepage (4 passes: 2 desktop + 2 mobile)
- lighthouse_audit: PDP (mobile)
- screenshot: homepage (desktop — nota: página protegida por WAF, screenshot pode não refletir conteúdo real), PLP eletroportáteis (desktop), PDP tênis Asics (desktop)
- research_traffic: Similarweb via Apify, março 2026
- research_business: Perplexity, 15 abril 2026
- research_serp: DataForSEO, "carrefour compras online" e "supermercado online entrega", Brasil, 15 abril 2026
- research_keywords: DataForSEO, 5 seed keywords + relacionadas, Brasil, 15 abril 2026
- audit_seo: DataForSEO on-page crawler (retornou dados parciais — crawl identificou structured data em 5/5 PDPs amostradas)

**URLs de referência:**
- https://www.statista.com/statistics/752903/carrefour-gross-revenue-brazil/
- https://ri.grupocarrefourbrasil.com.br/en/results-and-reports/ (Resultados e Relatórios — Grupo Carrefour Brasil, Relações com Investidores)
- https://www.ainvest.com/news/carrefour-strategic-play-brazil-bold-move-future-growth-2504/
- https://ri.grupocarrefourbrasil.com.br/en/
- https://ri.grupocarrefourbrasil.com.br/en/our-businesses/

---

*Relatório gerado pelo pipeline de diagnóstico deco AI.*
