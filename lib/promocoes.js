// Preço "de/por" das promoções.
//
// O XML da Loja Integrada manda o preço promocional como g:price e o preço do Pix
// como g:sale_price, então o Google mostra só "-5%" mesmo quando a loja tem
// "de R$ 139,90 por R$ 99,90". Este módulo lê as páginas de coleção da loja
// (ex.: /sale-2k26), onde aparecem os dois preços, e devolve um mapa
// SKU do produto (= g:item_group_id) → { de, por }.
//
// Se a leitura falhar, devolve um mapa vazio e o feed sai como antes.

const BASE = process.env.LOJA_URL || 'https://www.storepesadao.com.br';
// Coleções separadas por vírgula. Ex.: "sale-2k26,black-friday"
const COLECOES = (process.env.PROMO_COLECOES || 'sale-2k26').split(',').map((c) => c.trim()).filter(Boolean);
const MAX_PAGINAS = Number(process.env.PROMO_MAX_PAGINAS || 60);

const CABECALHOS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

function numeroBR(texto) {
  const m = String(texto || '').match(/(\d{1,3}(?:\.\d{3})*,\d{2}|\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const v = m[1].includes(',') ? m[1].replace(/\./g, '').replace(',', '.') : m[1];
  return Number(v);
}

// Lê os cartões de produto de uma página de listagem da Loja Integrada.
function lerListagem(html) {
  const itens = [];
  const partes = html.split(/<div class="listagem-item\b/).slice(1);
  for (const parte of partes) {
    const sku = (parte.match(/class="produto-sku[^"]*">\s*([^<\s]+)\s*</) || [])[1];
    const deTxt = (parte.match(/<s class="preco-venda[^"]*">([\s\S]*?)<\/s>/) || [])[1];
    const porAttr = (parte.match(/class="preco-promocional[^"]*"[^>]*data-sell-price="([\d.]+)"/) || [])[1];
    const porTxt = (parte.match(/<strong class="preco-promocional[^"]*"[^>]*>([\s\S]*?)<\/strong>/) || [])[1];
    const de = numeroBR(deTxt);
    const por = porAttr ? Number(porAttr) : numeroBR(porTxt);
    if (sku && de && por && de > por) itens.push({ sku, de, por });
  }
  return { itens, cartoes: partes.length };
}

async function baixar(url, tentativas = 3) {
  let ultimoErro;
  for (let i = 0; i < tentativas; i++) {
    try {
      const resp = await fetch(url, { headers: CABECALHOS });
      if (resp.ok) return await resp.text();
      ultimoErro = new Error(`HTTP ${resp.status} em ${url}`);
    } catch (e) {
      ultimoErro = e;
    }
    await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
  }
  throw ultimoErro;
}

async function lerPromocoes() {
  const mapa = new Map();
  const resumo = { colecoes: {}, erro: null };
  try {
    for (const colecao of COLECOES) {
      let total = 0;
      for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
        const html = await baixar(`${BASE}/${colecao}?pagina=${pagina}`);
        const { itens, cartoes } = lerListagem(html);
        if (!cartoes) break;
        const antes = mapa.size;
        for (const it of itens) mapa.set(it.sku, { de: it.de, por: it.por });
        total += itens.length;
        // Página repetida (a loja volta para a última página quando passa do fim)
        if (pagina > 1 && mapa.size === antes && itens.length) break;
      }
      resumo.colecoes[colecao] = total;
    }
  } catch (e) {
    resumo.erro = e.message;
  }
  return { mapa, resumo };
}

module.exports = { lerPromocoes, lerListagem, numeroBR, CABECALHOS };
