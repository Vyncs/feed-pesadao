// Regras para descobrir tamanho, cor, gênero e faixa etária a partir do
// título e do código (g:id) que a Loja Integrada já envia.
// Funciona tanto no Node quanto no navegador (sem dependências).

const TAMANHOS_LETRA = new Set([
  'PP', 'P', 'M', 'G', 'GG', 'GGG', 'GGGG', 'XG', 'XGG', 'XXG', 'EG', 'EGG', 'EXG', 'EXGG', 'G1', 'G2', 'G3', 'G4',
  'XS', 'S', 'L', 'XL', 'XXL', 'XXXL', '2XL', '3XL', '4XL',
]);
const TAMANHO_UNICO = /^(u|un|unico|único|tu|tam\.?\s*unico|tamanho\s+unico|tamanho\s+único|one\s*size|os)$/i;

const CORES = [
  // [padrão (sem acento, minúsculo), nome enviado ao Google]
  ['off white', 'Off White'], ['off-white', 'Off White'],
  ['azul marinho', 'Azul Marinho'], ['navy blue', 'Azul Marinho'], ['navy', 'Azul Marinho'],
  ['azul royal', 'Azul Royal'], ['royal blue', 'Azul Royal'],
  ['azul claro', 'Azul Claro'], ['light blue', 'Azul Claro'], ['baby blue', 'Azul Claro'],
  ['verde militar', 'Verde Militar'], ['verde oliva', 'Verde Oliva'], ['olive', 'Verde Oliva'],
  ['tie dye', 'Tie Dye'], ['camuflado', 'Camuflado'], ['camo', 'Camuflado'],
  ['preto', 'Preto'], ['preta', 'Preto'], ['black', 'Preto'],
  ['branco', 'Branco'], ['branca', 'Branco'], ['white', 'Branco'],
  ['cinza', 'Cinza'], ['grey', 'Cinza'], ['gray', 'Cinza'], ['mescla', 'Cinza Mescla'], ['heather', 'Cinza Mescla'],
  ['grafite', 'Grafite'], ['graphite', 'Grafite'], ['charcoal', 'Grafite'],
  ['azul', 'Azul'], ['blue', 'Azul'],
  ['vermelho', 'Vermelho'], ['vermelha', 'Vermelho'], ['red', 'Vermelho'],
  ['verde', 'Verde'], ['green', 'Verde'],
  ['amarelo', 'Amarelo'], ['amarela', 'Amarelo'], ['yellow', 'Amarelo'],
  ['laranja', 'Laranja'], ['orange', 'Laranja'],
  ['rosa', 'Rosa'], ['pink', 'Rosa'],
  ['roxo', 'Roxo'], ['roxa', 'Roxo'], ['purple', 'Roxo'], ['lilas', 'Lilás'], ['lilac', 'Lilás'],
  ['marrom', 'Marrom'], ['brown', 'Marrom'], ['chocolate', 'Marrom'],
  ['bege', 'Bege'], ['beige', 'Bege'], ['areia', 'Bege'], ['sand', 'Bege'], ['khaki', 'Cáqui'], ['caqui', 'Cáqui'],
  ['creme', 'Creme'], ['cream', 'Creme'], ['natural', 'Natural'],
  ['vinho', 'Vinho'], ['wine', 'Vinho'], ['bordo', 'Bordô'], ['burgundy', 'Bordô'], ['maroon', 'Bordô'],
  ['dourado', 'Dourado'], ['gold', 'Dourado'], ['prata', 'Prata'], ['silver', 'Prata'],
  ['colorido', 'Colorido'], ['multicolor', 'Colorido'], ['multi', 'Colorido'],
];

function semAcento(t) {
  return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizarTamanho(bruto) {
  if (!bruto) return null;
  let t = String(bruto).trim();
  if (TAMANHO_UNICO.test(semAcento(t))) return 'Único';
  const up = t.toUpperCase();
  if (TAMANHOS_LETRA.has(up)) return up;
  // Numeração de calçado/calça: 33 a 48, com meio número (37,5 / 37.5 / 37_5)
  const num = t.replace(/[._]/g, ',').match(/^(\d{2})(,5)?$/);
  if (num) {
    const n = Number(num[1]);
    if (n >= 16 && n <= 50) return num[1] + (num[2] || '');
  }
  // Boné fitted: 7 1/4, 7-1/4
  const fitted = t.match(/^([67])[\s-]+([1-7]\/8|[1-3]\/4|1\/2)$/);
  if (fitted) return `${fitted[1]} ${fitted[2]}`;
  return null;
}

const GENERO_PALAVRA = /^(masculin[oa]s?|feminin[oa]s?|unissex|unisex)$/i;

// Partes do código depois do SKU base: "5R8FJFXHA-unissex-preto-38" -> ["unissex","preto","38"]
function partesDoCodigo(id, grupo) {
  if (!id) return [];
  let resto;
  if (grupo && id.toLowerCase().startsWith(grupo.toLowerCase()) && id.length > grupo.length) {
    resto = id.slice(grupo.length);
  } else if (id.includes('-')) {
    resto = id.slice(id.indexOf('-'));
  } else {
    return [];
  }
  return resto.split(/[-_]/).filter(Boolean);
}

// Acessórios que, sem tamanho informado, são de tamanho único
const ACESSORIO = /^(bone|meia|meias|gorro|touca|mochila|pochete|bolsa|shoulder|shouder|sling|tote|necessaire|carteira|chaveiro|cadarco|cadarcos|miniatura|skate|shape|oculos|cinto|bag|bucket|viseira)\b/;

function detectarTamanho(titulo, id, grupo) {
  // 1) Final do título: "... Masculino M" / "... 7 1/4" / "... 38,5" / "... 42 Unissex"
  let t = String(titulo || '').trim();
  const fitted = t.match(/([67][\s-]+(?:[1-7]\/8|[1-3]\/4|1\/2))$/);
  if (fitted) return normalizarTamanho(fitted[1]);
  const palavras = t.split(/\s+/);
  while (palavras.length > 1 && GENERO_PALAVRA.test(semAcento(palavras[palavras.length - 1]))) palavras.pop();
  if (/^tamanho$/i.test(palavras[palavras.length - 2] || '') && TAMANHO_UNICO.test(semAcento(palavras[palavras.length - 1]))) return 'Único';
  const peloTitulo = normalizarTamanho(palavras[palavras.length - 1]);
  if (peloTitulo) return peloTitulo;

  // 2) Final do código da variação: "5R8FJFXHA-m", "XYZ-preto-38", "XYZ-preto-7-5-8"
  const partes = partesDoCodigo(id, grupo);
  const n = partes.length;
  if (n >= 3 && /^[67]$/.test(partes[n - 3]) && /^\d$/.test(partes[n - 2]) && /^[248]$/.test(partes[n - 1])) {
    const f = normalizarTamanho(`${partes[n - 3]} ${partes[n - 2]}/${partes[n - 1]}`);
    if (f) return f;
  }
  if (n >= 2 && /^\d{2}$/.test(partes[n - 2]) && partes[n - 1] === '5') {
    const meio = normalizarTamanho(`${partes[n - 2]},5`);
    if (meio) return meio;
  }
  for (let i = n - 1; i >= 0; i--) {
    const tam = normalizarTamanho(partes[i]);
    if (tam) return tam;
  }
  // Meio número sem separador no código: "-375" -> 37,5
  const meioJunto = n ? partes[n - 1].match(/^(\d{2})5$/) : null;
  if (meioJunto) {
    const meio = normalizarTamanho(`${meioJunto[1]},5`);
    if (meio) return meio;
  }

  // 3) Acessório sem tamanho no título nem no código: tamanho único
  if (ACESSORIO.test(semAcento(t).toLowerCase())) return 'Único';
  return null;
}

function detectarGenero(titulo) {
  const t = semAcento(titulo).toLowerCase();
  const masc = /\bmasculin[oa]s?\b|\bmens?\b/.test(t);
  const fem = /\bfeminin[oa]s?\b|\bwomens?\b/.test(t);
  if (/\bunissex\b|\bunisex\b/.test(t) || (masc && fem)) return 'unisex';
  if (masc) return 'male';
  if (fem) return 'female';
  return 'unisex';
}

function detectarIdade(titulo, tipos) {
  const t = semAcento(`${titulo} ${(tipos || []).join(' ')}`).toLowerCase();
  if (/\b(infantil|kids?|juvenil|crianca|baby|bebe|toddler)\b/.test(t)) return 'kids';
  return 'adult';
}

function detectarCor(titulo, tamanho) {
  let t = semAcento(titulo).toLowerCase().replace(/[\/|,+&]/g, ' ').replace(/\s+/g, ' ').trim();
  let palavras = t.split(' ');
  // Tira tamanho e gênero do fim para olhar onde a cor costuma ficar
  const fim = /^(masculin[oa]s?|feminin[oa]s?|unissex|unisex)$/;
  while (palavras.length && (fim.test(palavras[palavras.length - 1]) || normalizarTamanho(palavras[palavras.length - 1]))) {
    palavras.pop();
  }
  const procurar = (texto) => {
    const achadas = [];
    let resto = ` ${texto} `;
    // Procura primeiro as cores compostas (lista já está nessa ordem)
    const posicoes = [];
    for (const [padrao, nome] of CORES) {
      const re = new RegExp(`(?<=\\s)${padrao.replace(/[-]/g, '\\-')}(?=\\s)`, 'g');
      let m;
      while ((m = re.exec(resto)) !== null) {
        posicoes.push({ pos: m.index, nome });
        resto = resto.slice(0, m.index) + ' '.repeat(padrao.length) + resto.slice(m.index + padrao.length);
      }
    }
    posicoes.sort((a, b) => a.pos - b.pos);
    for (const p of posicoes) if (!achadas.includes(p.nome)) achadas.push(p.nome);
    return achadas;
  };
  // A cor costuma estar nas últimas palavras ("Camiseta X Logo Black")
  let cores = procurar(palavras.slice(-6).join(' '));
  if (!cores.length) cores = procurar(palavras.join(' '));
  return cores.length ? cores.slice(0, 3).join('/') : null;
}

// Quando o título não tem cor conhecida, a loja costuma pôr o nome da cor
// no código da variação: "XYZ-unissex-rose-of-sharon-38" -> "Rose Of Sharon"
function corPeloCodigo(id, grupo) {
  const partes = partesDoCodigo(id, grupo).filter(
    (p) => !GENERO_PALAVRA.test(p) && !normalizarTamanho(p) && !/^\d+$/.test(p) && !/^(alto|baixo|cano|longo|curto)$/i.test(p)
  );
  if (!partes.length) return null;
  const nome = partes.join(' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return nome.length >= 3 && nome.length <= 40 ? nome : null;
}

function enriquecer({ id, item_group_id, title, product_type }) {
  const size = detectarTamanho(title, id, item_group_id);
  return {
    size,
    color: detectarCor(title, size) || corPeloCodigo(id, item_group_id),
    gender: detectarGenero(title),
    age_group: detectarIdade(title, product_type),
  };
}

const api = { enriquecer, detectarTamanho, detectarCor, detectarGenero, detectarIdade, normalizarTamanho };
if (typeof module !== 'undefined') module.exports = api;
if (typeof window !== 'undefined') window.FeedPesadao = api;
