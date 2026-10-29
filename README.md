# Feed Pesadão (versão 2)

Gera todo dia o feed de produtos do Google Merchant Center da Store Pesadão.

## Como funciona

```
XML da Loja Integrada  →  gerar-feed.js  →  feed-google.xml  →  Merchant Center
(preço, estoque, links,    adiciona tamanho,   publicado no        busca o arquivo
 1 item por tamanho)       cor, gênero, idade  GitHub Pages        todo dia
```

- **Não usa chave de API.** Só lê o XML público que a loja já gera em
  `https://www.storepesadao.com.br/xml/f2b52/googlemerchant.xml`.
- **Não muda IDs, preços, estoque nem links.** Esses dados continuam vindo da loja.
- Só adiciona `g:size`, `g:color`, `g:gender` e `g:age_group` quando o item ainda não tem.
- Se a loja devolver menos de 100 itens (erro, site fora do ar), o feed anterior é mantido.

Teste com o XML real (29/10/2026, 4.498 itens): tamanho em 99,9% dos itens e cor em 94%.

## Instalação (uma vez só)

1. Crie um repositório **novo e público** no GitHub (ex.: `feed-pesadao`) e envie estes arquivos.
   Este código não tem nenhuma senha ou chave, então pode ser público.
2. No repositório: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Em **Actions → Atualizar feed do Google → Run workflow**, rode a primeira vez.
4. O feed fica em: `https://SEU-USUARIO.github.io/feed-pesadao/feed-google.xml`
   e o resumo em `.../relatorio.json`.

Depois disso ele roda sozinho todo dia às 05:17.

## Ligar no Merchant Center

1. **Fontes de dados → Adicionar fonte de produtos → Adicionar produtos de um arquivo → Inserir um link**.
2. Cole o link do `feed-google.xml`, país **Brasil**, idioma **Português**, busca **diária** (depois das 06:00).
3. Comece testando. Quando os produtos aparecerem aprovados, desligue as fontes antigas
   ("Content API" da Loja Integrada e o `feed.csv`) para não ter produtos em dobro.

## Rodar no computador (opcional)

```
node gerar-feed.js                        # baixa da loja
node gerar-feed.js --arquivo origem.xml   # usa um arquivo local
```

Precisa de Node 18 ou mais novo. Não tem dependências.
