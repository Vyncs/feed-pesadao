// Preço de cada produto direto da página dele no site.
//
// O XML da Loja Integrada manda o preço promocional como g:price e o preço do Pix
// como g:sale_price. A página de cada produto traz os dois preços reais no
// dataLayer do Google Analytics:
//   item_sku: '52DQ8DHNQ', ... full_price: 189.90, promotional_price: 151.90,
// Este módulo visita a página de cada produto (1 por item_group_id) e devolve
// um mapa SKU → { de, por }. Quando não há promoção, de === por.
//
// Páginas que falham ganham uma 2ª passada mais lenta. Se falhar de novo, o produto fica fora do mapa e o feed usa a regra
// antiga para ele (coleção de promoções ou só o preço cheio, sem o Pix).

const { CABECALHOS } = require('./promocoes');

const CONCORRENCIA = Number(process.env.PRECOS_CONCORRENCIA || 4);
const TEMPO_MAXIMO_MS = Number(process.env.PRECOS_TEMPO_MAXIMO_MS || 15 * 60 * 1000);
const TIMEOUT_MS = 20000;

// Lê full_price / promotional_price do dataLayer da página do produto.
function lerPrecoPagina(html) {
  const bloco = html.match(/item_sku:\s*'([^']+)'[\s\S]{0,600}?full_price:\s*([\d.]+)\s*,([\s\S]{0,200}?)\}/);
  if (!bloco) return null;
  const sku = bloco[1];
  const de = Number(bloco[2]);
  const promo = (bloco[3].match(/promotional_price:\s*([\d.]+)/) || [])[1];
  let por = promo ? Number(promo) : de;
  if (!(de > 0)) return null;
  if (!(por > 0) || por > de) por = de;
  return { sku, de, por };
}

async function baixar(url) {
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const resp = await fetch(url, { headers: CABECALHOS, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (resp.ok) return await resp.text();
      if (resp.status === 404) return null;
    } catch (e) {
      // tenta de novo
    }
    await new Promise((r) => setTimeout(r, 1500 * tentativa));
  }
  return null;
}

// produtos: Map item_group_id → URL da página (sem parâmetros)
async function lerPrecosSite(produtos) {
  const mapa = new Map();
  const resumo = { paginas: produtos.size, lidas: 0, com_promocao: 0, sem_promocao: 0, falhas: 0, interrompido: false };
  const fila = [...produtos.entries()];
  const inicio = Date.now();

  const falharam = [];

  async function trabalhador(lista, pausa) {
    while (lista.length) {
      if (Date.now() - inicio > TEMPO_MAXIMO_MS) {
        resumo.interrompido = true;
        return;
      }
      const [sku, url] = lista.shift();
      const html = await baixar(url);
      const preco = html && lerPrecoPagina(html);
      if (preco && preco.sku === sku) {
        mapa.set(sku, { de: preco.de, por: preco.por });
        resumo.lidas++;
        if (preco.por < preco.de) resumo.com_promocao++;
        else resumo.sem_promocao++;
      } else if (lista === fila) {
        falharam.push([sku, url]);
      } else {
        resumo.falhas++;
      }
      await new Promise((r) => setTimeout(r, pausa));
    }
  }

  await Promise.all(Array.from({ length: CONCORRENCIA }, () => trabalhador(fila, 150)));
  // 2ª passada, mais devagar, só nas páginas que falharam (o site limita muitas visitas seguidas).
  resumo.segunda_passada = falharam.length;
  if (falharam.length) {
    await new Promise((r) => setTimeout(r, 30000));
    await Promise.all(Array.from({ length: 2 }, () => trabalhador(falharam, 1200)));
  }
  resumo.segundos = Math.round((Date.now() - inicio) / 1000);
  return { mapa, resumo };
}

module.exports = { lerPrecosSite, lerPrecoPagina };
