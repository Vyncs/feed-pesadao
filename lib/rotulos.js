// Etiquetas (custom labels) para separar os produtos nas campanhas do Google Ads.
//   custom_label_0: faixa de preço (pelo preço promocional, se houver)
//   custom_label_1: categoria, pelo início do título
//   custom_label_2: grupo da campanha: "foco" (abaixo de R$ 400) ou "premium" (R$ 400 ou mais)
// Os valores só usam letras minúsculas, números e hífen, como o Google recomenda.

const LIMITE_PREMIUM = Number(process.env.LIMITE_PREMIUM || 400);

const CATEGORIAS = [
  [/^(tenis|sapatenis|bota)\b/, 'tenis'],
  [/^(chinelo|slide|sandalia)\b/, 'chinelo'],
  [/^bone\b/, 'bone'],
  [/^(camiseta|camisa|regata|cropped|polo|top)\b/, 'camiseta'],
  [/^(moletom|hoodie|agasalho|blusa|suéter|sueter|cardigan)\b/, 'moletom'],
  [/^(jaqueta|corta[\s-]vento|colete|parka|casaco)\b/, 'jaqueta'],
  [/^(shorts?|bermuda)\b/, 'shorts'],
  [/^(calca|jogger)\b/, 'calca'],
  [/^(meia|meias|gorro|touca|mochila|pochete|bolsa|shoulder|shouder|sling|tote|necessaire|carteira|chaveiro|cadarco|oculos|cinto|bag|bucket|viseira|miniatura)\b/, 'acessorio'],
  [/^(skate|shape|truck|roda|rolamento|lixa)\b/, 'skate'],
];

function semAcento(t) {
  return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function valorNumerico(texto) {
  const m = String(texto || '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? Number(m[1].replace(',', '.')) : null;
}

function faixaPreco(preco) {
  if (preco == null) return null;
  if (preco < 200) return 'ate-199';
  if (preco < 400) return '200-399';
  if (preco < 600) return '400-599';
  return '600-mais';
}

function categoria(titulo) {
  const t = semAcento(titulo).toLowerCase().trim();
  for (const [re, nome] of CATEGORIAS) if (re.test(t)) return nome;
  return 'outros';
}

function rotular({ title, price, sale_price }) {
  const preco = valorNumerico(sale_price) || valorNumerico(price);
  return {
    custom_label_0: faixaPreco(preco),
    custom_label_1: categoria(title),
    custom_label_2: preco == null ? null : preco >= LIMITE_PREMIUM ? 'premium' : 'foco',
  };
}

module.exports = { rotular, categoria, faixaPreco };
