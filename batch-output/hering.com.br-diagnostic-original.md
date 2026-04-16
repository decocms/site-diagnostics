# Diagnostic report: Hering (Grupo Azzas 2154)

> **Date:** 2026-04-15 **URL:** hering.com.br **Platform:** VTEX FastStore (Next.js) / CloudFront CDN **Monthly visits:** ~4,9M (março 2026)[^sw] **Category:** Lifestyle / Fashion & Apparel **Ranking global:** #9.291 | **Ranking Brasil:** #483 | **Ranking categoria:** #8

**Health Score: 42/100** — Structured Data 12/20 | Content Engine 0/15 | Product SEO 8/15 | Performance 3/20 | Social Proof 6/10 | Cross-sell 3/10 | Domain Signals 8/10

**Inventário do site:** 11 sitemaps de produto identificados em sitemap.xml, cada um contendo aproximadamente 300+ URLs de produto (medido por contagem de `<loc>` nos XMLs retornados). O sitemap de categorias lista 271 categorias/subcategorias. O crawl_site (limitado a 500 páginas) identificou 222 PDPs e 7 PLPs na amostra. Nenhuma seção editorial foi detectada.[^inventory]

[^inventory]: Sitemaps coletados via fetch_page em 2026-04-15. Crawl_site limitado a 500 páginas via Firecrawl. Contagem precisa de produtos nos sitemaps não foi possível devido ao truncamento de resposta — cada XML tem ~123-128KB, consistente com ~300 URLs por arquivo, totalizando estimativa de 3.000+ PDPs no catálogo. Esse número é uma estimativa baseada na estrutura dos sitemaps, não uma contagem exata.

[^sw]: Dados de tráfego via Similarweb (estimativas baseadas em painel, não dados first-party). Período: março 2026.

---

![Homepage Hering](http://localhost:3002/api/screenshots/www.hering.com.br-desktop-26a30856.png)

---

## Aproximadamente 12.800 oportunidades de melhoria identificadas em hering.com.br

Identificamos **7 áreas de melhoria** representando **aproximadamente 12.800 melhorias a nível de página** em **cerca de 3.500 URLs únicas**. A performance mobile é o maior gargalo: a homepage registrou LCP de 19,6s e TBT de 2.210ms no Lighthouse, e as PDPs atingiram 29,7s de LCP — valores que limitam diretamente a conversão em um site que recebe quase 5 milhões de visitas mensais. A ausência de uma engine de conteúdo editorial impede a marca de capturar tráfego orgânico informacional em categorias de alto volume como "pijama feminino" (110K buscas/mês) e "camiseta básica" (9.900 buscas/mês). Os PDPs contam com reviews (1.933 avaliações na Camiseta World) mas não apresentam blocos de cross-sell visíveis, limitando o potencial de aumento de ticket médio.

---

## Oportunidades

### 1. Performance mobile: LCP e TBT em níveis que limitam conversão

O Lighthouse mobile mediu na homepage um Performance Score de 33/100, com LCP de 19,6s, TBT de 2.210ms, e payload total de 38,4MB. A PDP da Camiseta World registrou Performance Score de 23/100, com LCP de 29,7s, TBT de 17.910ms, e payload de 13,3MB. Em ambos os casos, a maior parte do problema está no JavaScript: 1.141KB de JS não utilizado na homepage e 1.298KB na PDP (fonte: Lighthouse unused-javascript audit). A main-thread ficou ocupada por 12,6s na homepage e 36,6s na PDP.

O capture_har da PLP /camisetas (o único que completou sem timeout) confirma o padrão: o carregamento cold-desktop totalizou 10,3MB em 60 requests, com o GTM sendo o terceiro recurso mais lento (1.352ms). O TTFB, por outro lado, é excelente — 127ms cold, 18ms warm — indicando que o CloudFront e o SSG do Next.js estão bem configurados. O gargalo está inteiramente no lado cliente.

| Action | Pages affected |
|---|---|
| Reduzir JavaScript não utilizado e otimizar carregamento client-side | Site-wide (~3.500+ páginas) |

Segundo pesquisa da Deloitte ("Milliseconds Make Millions", 2020), cada 0,1s de melhoria no tempo de carregamento mobile gera +8,4% de conversão no varejo. Com LCP atual acima de 19s na homepage, há espaço significativo de melhoria com impacto direto em receita.

### 2. Content engine editorial não detectado

Testamos 9 caminhos editoriais comuns no domínio (/blog, /editorial, /revista, /conteudo, /magazine, /news, /noticias, /stories, /inspira) — todos retornaram HTTP 404. O crawl_site não identificou páginas de blog. O sitemap.xml não contém sitemaps editoriais. O robots.txt não referencia caminhos de conteúdo.

A marca compete em categorias com volume de busca informacional significativo: "pijama feminino" tem 110.000 buscas/mês, "camiseta básica" 9.900, "cueca boxer" 18.100, "roupa infantil" 40.500 (fonte: DataForSEO, abril 2026). Pesquisas relacionadas como "Qual a melhor marca de camiseta básica?" (People Also Ask para "camiseta basica masculina") representam demanda informacional que direciona diretamente para comparações de marca.

| Action | Pages affected |
|---|---|
| Criar engine de conteúdo editorial otimizada para SEO | Novo (estimativa: 50-100 artigos iniciais) |

Empresas com blogs ativos tendem a gerar significativamente mais visitantes orgânicos do que empresas sem presença editorial. Para uma marca que já é referência em "básicos", conteúdo editorial sobre tecidos, sustentabilidade e guias de estilo teria fit natural.

### 3. Descrições meta com HTML inline nas PDPs

Dos 3 PDPs analisados via scrape_page, todos apresentam meta descriptions que contêm tags HTML cruas (`<br />`, `<b>`, `<li>`) no atributo description. Exemplo da Camiseta World: a description inclui fragmentos como `<a href="...">hering</a>` e listas em `<li>`. Esses fragmentos HTML aparecem como texto quebrado nos resultados de busca, reduzindo CTR e credibilidade do snippet.

As meta descriptions também parecem ser geradas automaticamente a partir da descrição do produto, sem otimização para palavras-chave de busca. O conteúdo é idêntico ao bloco "Sobre a peça" do PDP.

| Action | Pages affected |
|---|---|
| Corrigir meta descriptions removendo HTML e criando descrições otimizadas para SERP | ~3.000+ PDPs |

Rich snippets bem formatados aumentam CTR em 20-40% (Search Engine Journal / Ahrefs).

### 4. Cross-sell e recomendações não detectados nas PDPs

Nos 3 PDPs analisados via scrape_page (Camiseta World, Kit Cuecas Boxer, Pijama Feminino), nenhum bloco de recomendação ou cross-sell foi identificado no conteúdo renderizado. O markdown extraído mostra: galeria de imagens, descrição do produto, cuidados, e seção de dúvidas — sem seção "Complete o look", "Você também vai gostar" ou produtos relacionados.

A Camiseta World exibe um link para "3 por R$59,99 cada", o que sugere uma mecânica de bundle, mas não há recomendação personalizada visível.

| Action | Pages affected |
|---|---|
| Implementar blocos de cross-sell e recomendação nas PDPs | ~3.000+ PDPs |

Recomendações de produto representam 10-30% da receita de e-commerce (McKinsey). O AOV médio em lojas com cross-sell ativo sobe 8-15% (Baymard Institute).

### 5. Structured Data parcial — BreadcrumbList e Product detectados, mas cobertura incompleta em PLPs

O audit_seo detectou structured data (BreadcrumbList, Product) em 5 de 5 PDPs amostradas. Porém, a PLP /camisetas renderizada via render_page apresenta apenas WebSite schema com SearchAction — sem ItemList ou CollectionPage. Nas PDPs, os reviews existem visualmente (1.933 avaliações na Camiseta World, nota 4.6; 17 avaliações no Kit Cuecas, nota 4.9; 30 avaliações no Pijama, nota 4.8), mas não pudemos confirmar a presença de `aggregateRating` no JSON-LD Product devido ao timeout no render_page da PDP.

| Action | Pages affected |
|---|---|
| Garantir aggregateRating no JSON-LD Product e adicionar structured data nas PLPs | ~3.000+ PDPs + 271 PLPs |

### 6. Reviews presentes mas com distribuição desigual

Dos 3 PDPs analisados, a Camiseta World tem 1.933 reviews (nota 4.6), enquanto o Kit Cuecas tem apenas 17 e o Pijama Feminino tem 30. Produtos com menos de 50 reviews convertem a uma taxa significativamente inferior: produtos com 50+ reviews convertem 2-3x mais do que produtos sem reviews (Bazaarvoice / Spiegel). A coleta ativa de reviews via email pós-compra (taxa de resposta típica: 5-15%) pode acelerar a cobertura no catálogo.

| Action | Pages affected |
|---|---|
| Implementar programa sistemático de coleta de reviews | ~3.000+ PDPs (contínuo) |

### 7. Higiene técnica

**Robots.txt:** Presente e funcional, mas o audit_seo reportou "not found" — possivelmente porque o DataForSEO não seguiu o redirect para o path com `?__decoFBT=0`. O fetch_page confirmou HTTP 200 com conteúdo válido. O robots.txt inclui bloqueios adequados para /checkout, /account, /login, /busca. Não referencia o sitemap.xml.

**Sitemap.xml:** Presente com 17 sitemaps filhos (11 de produto, 1 de categoria, 1 de marca, 4 de custom routes). Não há referência ao sitemap.xml no robots.txt.

**SSL e HTTP/2:** Ativos. Canonicals detectados na PLP (/camisetas aponta para `https://www.hering.com.br/camisetas`).

**Cache:** Excelente. Assets estáticos com `max-age=31536000, immutable`. HTML com `s-maxage=31536000, stale-while-revalidate=31536000`. CloudFront serving com cache hits consistentes.

**Requisição falhada:** O capture_har detectou uma request 404 para `/_next/data/.../api/io/login.json`.

| Action | Pages affected |
|---|---|
| Adicionar referência ao sitemap.xml no robots.txt; corrigir request 404 do login.json | Site-wide |

---

## Resumo de oportunidades

| Oportunidade | Ação | Páginas afetadas |
|---|---|---|
| 1. Performance mobile | Reduzir JS não utilizado e otimizar client-side | ~3.500+ (site-wide) |
| 2. Content engine | Criar seção editorial otimizada para SEO | Novo (50-100 artigos) |
| 3. Meta descriptions | Remover HTML inline e otimizar para SERP | ~3.000+ PDPs |
| 4. Cross-sell | Implementar recomendações nas PDPs | ~3.000+ PDPs |
| 5. Structured data | Completar JSON-LD com aggregateRating + PLPs | ~3.271 páginas |
| 6. Reviews | Programa de coleta sistemática | ~3.000+ PDPs (contínuo) |
| 7. Higiene técnica | Robots.txt → sitemap, corrigir 404 | Site-wide |
| **Total** | **7 áreas** | **~12.800 melhorias a nível de página em ~3.500 URLs únicas** |

O que cada melhoria exige depende da plataforma e do time. O volume — aproximadamente 12.800 melhorias individuais distribuídas por cerca de 3.500 URLs — e a natureza contínua do trabalho (novos produtos herdam os mesmos gaps, reviews precisam ser coletados permanentemente) tornam a execução automatizada essencial.

---

## O que isso requer

As melhorias mapeadas tocam milhares de páginas simultaneamente, e o catálogo da Hering não é estático: novos produtos entram regularmente, herdando os mesmos gaps de meta descriptions com HTML, ausência de cross-sell e cobertura de reviews. Corrigir o estado atual é apenas metade do desafio — manter a qualidade ao longo do tempo é a outra metade.

Algumas correções são pontuais (referência ao sitemap no robots.txt, correção de uma request 404). Outras — limpeza de meta descriptions em milhares de PDPs, produção editorial, coleta de reviews, monitoramento de Core Web Vitals — são trabalho contínuo, granular e sensível ao tempo.

deco AI Agents são agentes especializados que executam esse tipo de trabalho continuamente. O que tradicionalmente levaria semanas de sprint, deco entrega em minutos, no piloto automático. Coloque sua estratégia digital para rodar no piloto automático.

---

## Contexto estratégico

A Hering ocupa uma posição privilegiada no mercado brasileiro de moda: é a #8 em Fashion & Apparel no Brasil por tráfego web, com aproximadamente 4,9 milhões de visitas mensais e uma marca reconhecida por mais de 90% da população, segundo pesquisa de mercado.[^rb1] Desde a aquisição pelo Grupo SOMA (agora Azzas 2154) em 2021, a marca passou por um reposicionamento visual centrado em "minimalismo colorido" e identidade brasileira.[^rb2]

O tráfego orgânico de busca representa aproximadamente 45% das visitas (search share de 45,2%), equiparando-se ao tráfego direto (46,7%).[^sw] A marca "hering" tem volume de busca de 550.000/mês (DataForSEO, abril 2026), dominando a posição #1 para o termo de marca no Google Brasil (DataForSEO, Brasil, 15/04/2026). Para termos de categoria como "camiseta basica masculina", a Hering aparece na posição #2 (DataForSEO, Brasil, 15/04/2026), disputando com C&A, Reserva e Aramis.

A oportunidade imediata está em converter a autoridade de marca já consolidada em eficiência operacional no canal digital. O tráfego pago representa apenas ~3,8% das visitas, o que sugere dependência saudável de orgânico — mas essa dependência torna a performance técnica e a cobertura de SEO ainda mais críticas. Cada segundo a mais no LCP e cada PDP sem structured data completo representam conversões perdidas em um canal que já atrai milhões de visitantes.

[^rb1]: Segundo dados de mercado (fontes: FashionUnited, Investing.com). Nota: o percentual de reconhecimento de marca de 90%+ é amplamente citado em cobertura jornalística da marca, mas não foi possível verificar uma fonte primária de pesquisa de mercado.
[^rb2]: Fonte: Futurebrand case study (https://www.futurebrand.com/our-work/hering).

---

## Referências e metodologia

**Benchmarks da indústria citados:**
- Deloitte, "Milliseconds Make Millions", 2020 (37 marcas, 30M sessões): +8,4% conversão por 0,1s de melhoria mobile
- McKinsey: recomendações de produto representam 10-30% da receita de e-commerce
- Search Engine Journal / Ahrefs: rich snippets aumentam CTR em 20-40%
- Bazaarvoice / Spiegel: produtos com 50+ reviews convertem 2-3x mais
- Baymard Institute: AOV uplift médio com cross-sell de 8-15%

**Fontes de dados:**
- crawl_site (Firecrawl): 500 páginas, 15/04/2026
- fetch_page: sitemap.xml, robots.txt, 11 sitemaps de produto, 1 sitemap de categoria, 9 paths editoriais, 5 PDPs/PLPs — 15/04/2026
- capture_har: PLP /camisetas (4 passes), 15/04/2026
- lighthouse_audit: homepage mobile, PDP mobile — 15/04/2026
- screenshot: homepage desktop — 15/04/2026
- render_page: PLP /camisetas (meta + JSON-LD extraídos), 15/04/2026
- scrape_page (Firecrawl): 3 PDPs, 15/04/2026
- audit_seo (DataForSEO): on-page score 89.21, 15/04/2026
- research_serp (DataForSEO): "hering" e "camiseta basica masculina", Brasil, 15/04/2026
- research_keywords (DataForSEO): 5 seeds, 40+ keywords retornadas, 15/04/2026
- research_traffic (Similarweb via Apify): março 2026
- research_business (Perplexity): 15/04/2026

**Source URLs:**
- https://www.investing.com/equities/cia-hering-on-nm-company-profile
- https://fashionunited.com/companies/hering
- https://www.futurebrand.com/our-work/hering

---

*Report generated by the deco AI diagnostic pipeline.*
