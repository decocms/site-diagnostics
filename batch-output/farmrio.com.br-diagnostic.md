# Diagnóstico: FARM Rio (Grupo Soma)

> **Data:** 2026-04-15 | **URL:** farmrio.com.br | **Plataforma:** deco (Kubernetes) + VTEX (backend) | **Visitas mensais:** ~6,3M (março/2026)[^sw]
> **Categoria:** Lifestyle / Fashion & Apparel | **Ranking global:** #8.527 | **Ranking Brasil:** #442 | **Ranking na categoria:** #7

**Health Score: 52/100** — Structured Data 15/20 | Content Engine 0/15 | Product SEO 10/15 | Performance 3/20 | Social Proof 0/10 | Cross-sell 5/10 | Domain Signals 10/10

**Inventário do site:** Aproximadamente 3.500 PDPs medidos em 7 sitemaps de produto (product-0.xml a product-6.xml, que totalizaram ~885KB de URLs). 69 categorias no sitemap category-0.xml. Nenhuma seção editorial identificada (3 métodos de descoberta utilizados). crawl_site retornou 500 páginas (limite do crawl), das quais 419 foram classificadas como PDPs.[^inventory]

[^inventory]: Contagem de produtos: 7 sitemaps de produto com ~500 URLs cada para os 6 primeiros (136-141KB) e ~200 para o último (55KB), totalizando ~3.500 URLs. Categorias: 69 URLs em category-0.xml. Editorial: testados /blog, /editorial, /revista, /conteudo, /magazine, /news, /noticias, /stories, /inspira — todos retornaram "não foi encontrada" ou redirect para homepage. crawl_site com limite de 500 páginas.

[^sw]: Dados de tráfego estimados via Similarweb (painel de terceiros, março/2026). Valores são aproximados e não representam dados first-party. Tendência: 7,2M (jan) → 7,2M (fev) → 6,3M (mar/2026).

---

## Aproximadamente 3.694 oportunidades de melhoria identificadas em farmrio.com.br

Identificamos **8 áreas de melhoria** representando **aproximadamente 3.694 melhorias ao nível de página** em **aproximadamente 3.569 URLs únicas**. Os achados mais relevantes são: performance mobile abaixo do aceitável (homepage com LCP de 13s e TTI de 29s no Lighthouse), ausência de conteúdo editorial num mercado com volume de busca expressivo por termos de inspiração de moda, e reviews de clientes não detectados nas PDPs analisadas — um ativo fundamental para conversão em moda feminina.

---

## Oportunidades

### 1. Performance mobile: homepage e PLPs não carregam dentro de 30s

A homepage e a PLP de vestidos não completaram o carregamento em 30 segundos no nosso navegador de teste (capture_har retornou timeout). A auditoria Lighthouse mobile da homepage registrou um score de **36/100**, com LCP de **13,0s**, TBT de **4.800ms** e TTI de **29,4s**. O payload total foi de **9.534 KiB**. Na PDP analisada, o cenário é semelhante: Lighthouse score de **35/100**, LCP de **8,4s** e payload de **3.677 KiB** (fonte: lighthouse_audit mobile).

O documento HTML principal da PDP pesou **5,2MB** (fonte: capture_har, cold pass), com TTFB de **5.677ms** no desktop (cold) e **1.332ms** no mobile (cold). A maior parte do bloqueio vem de JavaScript: **8,7s de boot-up time** na homepage e **9,0s** na PDP. Lighthouse identificou **679 KiB de JavaScript não utilizado** que poderiam ser eliminados.

Dados os approximately 6,3 milhões de visitas mensais e taxa de bounce de aproximadamente 35% (Similarweb), cada 0,1s de melhoria na velocidade mobile pode representar um aumento mensurável em conversão. Segundo a Deloitte ("Milliseconds Make Millions", 2020), cada 0,1s de melhoria gera +8,4% de conversão em retail.

| Ação | Páginas afetadas |
|---|---|
| Otimizar performance mobile (JS, payload, TTFB) | Site-wide (~3.569 URLs) |

### 2. Ausência de content engine editorial

Testamos 9 paths editoriais comuns (/blog, /editorial, /revista, /conteudo, /magazine, /news, /noticias, /stories, /inspira). Todos retornaram páginas "não foi encontrada" ou redirect para landing pages de coleção. O crawl_site não classificou nenhuma página como blog. O sitemap não contém nenhum XML editorial dedicado (apenas product, category, brand e deco). O audit_seo confirmou: `totalBlogPosts: 0`.

A keyword "vestido farm" tem volume de 110.000 buscas/mês, e variações como "vestido longo farm" (22.200), "vestido curto farm" (14.800) e "vestido floral" (8.100) indicam forte demanda informacional e de inspiração (fonte: research_keywords, DataForSEO). A FARM Rio domina queries branded, mas sem conteúdo editorial não captura tráfego informacional de topo de funil — termos como "como montar look com vestido estampado" ou "tendências de moda tropical".

Empresas com blogs ativos tendem a gerar significativamente mais tráfego orgânico do que aquelas sem estratégia editorial.

| Ação | Páginas afetadas |
|---|---|
| Criar content engine editorial (blog, guias de estilo, lookbooks indexáveis) | Nova seção (potencial 50-100+ artigos/ano) |

### 3. Reviews de clientes não detectados nas PDPs

Nas 3 PDPs analisadas via scrape_page (Vestido Longo Natureza Romântica, Vestido Curto Bibelô Preto, Calça Lenço Arabesque), nenhuma seção de reviews ou avaliações de clientes foi identificada no conteúdo renderizado. A seção de cross-sell ("Leve o look") foi detectada em 1 das 3 PDPs analisadas.

Cada PDP contém descrição de produto, tabela de medidas, composição e informações de entrega — mas a prova social de outros compradores, que é um dos maiores influenciadores de conversão em moda online, não foi detectada. Produtos com 5 ou mais reviews apresentam 270% maior probabilidade de compra em comparação a produtos sem avaliações (Spiegel Research Center, 2017).

| Ação | Páginas afetadas |
|---|---|
| Implementar sistema de reviews nas PDPs | ~3.500 PDPs |

### 4. Páginas com meta descriptions e titles duplicados

O audit_seo (DataForSEO, crawl parcial) identificou **22 páginas com title tags duplicados** e **22 páginas com meta descriptions duplicadas**, além de **37 páginas sem meta description** e **38 sem tag H1**. Foram também detectadas **62 páginas de conteúdo duplicado** e **833 páginas não-indexáveis** (severidade média).

As PLPs analisadas apresentam meta descriptions genéricas. A PLP de vestidos, por exemplo, usa "descubra os lançamentos da coleção de alto inverno" — a mesma meta description da homepage. Já as PDPs possuem descrições únicas e detalhadas (baseado em 3 PDPs amostradas), o que é positivo.

| Ação | Páginas afetadas |
|---|---|
| Corrigir meta descriptions duplicadas e ausentes | ~59 páginas (22 duplicadas + 37 ausentes) |
| Corrigir title tags duplicados | 22 páginas |
| Adicionar tag H1 em páginas que não possuem | 38 páginas |

### 5. Cache da homepage desabilitado

A homepage retorna `cache-control: no-store, no-cache, must-revalidate` e `cf-cache-status: BYPASS` (fonte: fetch_page). Isso significa que cada visita gera uma renderização completa no servidor, sem cache de CDN. As PDPs seguem o mesmo padrão (`no-store, no-cache`).

Os assets estáticos (CSS, JS, imagens) possuem cache adequado (max-age de 1 ano para styles.css, imagens com 4 dias no CloudFront). A oportunidade está no HTML: habilitar cache no edge (mesmo que de curta duração — 60s) reduziria a carga do servidor e melhoraria TTFB de forma significativa para visitantes frequentes.

| Ação | Páginas afetadas |
|---|---|
| Habilitar cache de HTML no CDN (Cloudflare/CloudFront) | Site-wide |

### 6. Cross-sell presente em apenas parte das PDPs

Das 3 PDPs analisadas, apenas a Calça Lenço Arabesque apresentou o bloco "Leve o look" com sugestão de peça complementar (Regata Lenço Arabesque). As outras 2 PDPs (Vestido Longo Natureza Romântica e Vestido Curto Bibelô Preto) não exibiram nenhum bloco de recomendação ou cross-sell no conteúdo renderizado.

Personalização — que inclui recomendações de produto — pode gerar um aumento de 5-15% na receita (McKinsey, 2021). Para um catálogo de ~3.500 SKUs com estampas exclusivas, combinar peças é uma extensão natural do storytelling da marca. O impacto do cross-sell no AOV varia conforme a implementação e o segmento.

| Ação | Páginas afetadas |
|---|---|
| Padronizar cross-sell/recomendações em todas as PDPs | ~3.500 PDPs |

### 7. Third-party scripts impactando performance

A PDP analisada carrega scripts de **10 domínios third-party** (fonte: capture_har). O maior impacto vem do VWO (Visual Website Optimizer): **4 requests / 800 KB** do domínio `dev.visualwebsiteoptimizer.com`. Somado ao Google Ads (191 KB), cookie consent (30 KB) e tracking, são 16+ requests third-party adicionando latência.

O Lighthouse identificou **19,9s de trabalho na main thread** (homepage) — a maior parte atribuível a JavaScript.

| Ação | Páginas afetadas |
|---|---|
| Auditar e otimizar scripts third-party (VWO, tracking) | Site-wide |

### 8. Higiene técnica

**Structured data:** O audit_seo detectou Product JSON-LD (ProductDetailsPage) em 5 de 5 PDPs amostradas — cobertura positiva. BreadcrumbList também presente. A marca já está à frente da maioria dos concorrentes neste aspecto.

**Sinais de domínio:** SSL habilitado, sitemap válido, robots.txt bem estruturado (inclui bloqueio de UTMs e Deco internals), HTTP/2 suportado (fonte: audit_seo). Score on-page do DataForSEO: 82,29/100.

| Ação | Páginas afetadas |
|---|---|
| Manter e monitorar structured data conforme catálogo cresce | Contínuo |

---

![PDP — Vestido Longo Estampado Natureza Romântica](http://localhost:3002/api/screenshots/www.farmrio.com.br-desktop-780b6f3c.png)

---

## Resumo das oportunidades

| Oportunidade | Ação | Páginas afetadas |
|---|---|---|
| 1. Performance mobile | Otimizar JS, payload, TTFB | ~3.569 URLs |
| 2. Content engine editorial | Criar blog/guias indexáveis | Nova seção |
| 3. Reviews de clientes | Implementar sistema de reviews | ~3.500 PDPs |
| 4. Meta descriptions e titles | Corrigir duplicatas e ausentes | ~119 páginas |
| 5. Cache de HTML | Habilitar cache no CDN | Site-wide |
| 6. Cross-sell nas PDPs | Padronizar recomendações | ~3.500 PDPs |
| 7. Third-party scripts | Auditar e otimizar | Site-wide |
| 8. Higiene técnica | Monitorar structured data | Contínuo |
| **Total** | **8 áreas** | **~3.694 melhorias em ~3.569 URLs únicas** |

O que cada melhoria exige depende da plataforma e do time. O volume — aproximadamente 3.694 melhorias individuais em cerca de 3.569 URLs — e a natureza contínua do trabalho (novos produtos, novos conteúdos, monitoramento de performance) tornam a execução automatizada essencial.

---

## O que isso requer

As melhorias identificadas tocam milhares de páginas de produto, dezenas de categorias e a criação de uma seção editorial inteira. O catálogo não é estático: novas coleções são lançadas a cada temporada, e cada novo produto herda os mesmos gaps de reviews, cross-sell e performance.

Alguns ajustes são pontuais (cache headers, meta descriptions de PLPs), mas o trabalho mais relevante é contínuo: produção de conteúdo editorial, coleta e moderação de reviews, monitoramento de performance a cada deploy, e manutenção de structured data conforme o catálogo evolui.

deco AI Agents são agentes especializados que executam esse trabalho de forma contínua. O que tradicionalmente leva semanas — auditar milhares de PDPs, gerar descrições otimizadas, monitorar performance — deco entrega em minutos, no piloto automático. Coloque sua estratégia digital no piloto automático.

---

## Contexto estratégico

A FARM Rio ocupa uma posição privilegiada no mercado brasileiro de moda feminina: #1 orgânico para "vestido estampado feminino" (DataForSEO, Brasil, abril 2026) e #1 para a query branded "FARM Rio". Com aproximadamente 6,3 milhões de visitas mensais e 96,3% do tráfego originário do Brasil[^sw], o canal DTC brasileiro é o motor principal do negócio digital — complementado por uma operação internacional que, segundo reportagem da Glossy[^rb1], teria gerado receita expressiva no mercado internacional.

O tráfego de busca representa aproximadamente 40,6% das visitas, com a keyword "vestido farm" atingindo 110.000 buscas/mês — um indicador da força da marca[^sw]. No entanto, esse tráfego é quase inteiramente branded. Sem content engine editorial, a FARM Rio não captura o volume informacional e de inspiração que naturalmente precede a compra em moda feminina. Keywords como "vestido estampado" (6.600/mês), "vestido floral" (8.100/mês) e "vestido longo estampado" (6.600/mês) representam uma oportunidade de topo de funil que hoje está descoberta.

A concorrência direta no digital vem de players como Zinzane (#2 para "vestido estampado feminino"), Renner, Zara e fast-fashion com operação de conteúdo ativa. A FARM Rio diferencia-se pela exclusividade das estampas e pelo storytelling "Carioca lifestyle", mas essa narrativa vive nas redes sociais — não no próprio domínio. A migração de parte desse storytelling para conteúdo indexável no site ampliaria a captura orgânica sem diluir a identidade de marca.

O investimento em performance é particularmente sensível: com 7,1% do tráfego vindo de paid[^sw] e a homepage demorando mais de 30 segundos para carregar completamente no mobile, há risco de que a conversão paga sofra tanto quanto a orgânica.

[^rb1]: Fonte: Glossy, "How FARM Rio customizes its products and operations for each market", via research_business (Perplexity).

---

## Referências e metodologia

**Benchmarks de indústria citados:**
- Deloitte, "Milliseconds Make Millions" (2020): 0,1s → +8,4% conversão (retail)
- McKinsey (2021): personalização → aumento de 5-15% na receita
- Spiegel Research Center (2017): produtos com 5+ reviews → 270% maior probabilidade de compra
- HubSpot: blogs ativos → ~55% mais visitantes

**Fontes de dados:**
- crawl_site (Firecrawl): 500 páginas descobertas, 15/04/2026
- fetch_page: homepage, robots.txt, sitemap.xml, 7 sitemaps de produto, category-0.xml, 3 PDPs, 2 PLPs, 9 paths editoriais
- capture_har: 1 PDP (4 passes desktop+mobile); homepage e PLP com timeout (30s)
- lighthouse_audit: homepage mobile, PDP mobile (Lighthouse 13.0.3)
- audit_seo (DataForSEO): crawl parcial, score 82,29/100
- research_traffic (Similarweb): março 2026
- research_serp (DataForSEO): "FARM Rio" e "vestido estampado feminino", Brasil, 15/04/2026
- research_keywords (DataForSEO): 5 seeds, 40+ keywords retornadas
- research_business (Perplexity): contexto corporativo
- scrape_page (Firecrawl): 3 PDPs analisadas
- screenshot: 1 PDP desktop (homepage e PLP retornaram timeout)

**URLs de referência:**
- https://farmrio.com/pages/about
- https://www.glossy.co/fashion/how-farm-rio-customizes-its-products-and-operations-for-each-market/
- https://www.hbs.edu/faculty/Pages/item.aspx?num=64770

---

*Relatório gerado pelo pipeline de diagnóstico deco AI.*

---
