#!/usr/bin/env node
// Lê o XML que a Loja Integrada gera para o Google e completa os campos
// que faltam (tamanho, cor, gênero e faixa etária).
// Não muda IDs, estoque nem links: esses continuam vindo da loja.
// Preço: nos produtos em promoção (coleção SALE da loja), troca o par
// preço/Pix que a loja manda pelo par "de/por" que aparece no site (lib/promocoes.js).
//
// Uso:
//   node gerar-feed.js                       (baixa o XML da loja)
//   node gerar-feed.js --arquivo origem.xml  (usa um arquivo local)
//   Saída: publico/feed-google.xml e publico/relatorio.json

const fs = require('fs');
const path = require('path');
const { enriquecer } = require('./lib/enriquecer');
const { rotular } = require('./lib/rotulos');
const { lerPromocoes, CABECALHOS } = require('./lib/promocoes');

const FEED_URL = process.env.FEED_URL || 'https://www.storepesadao.com.br/xml/f2b52/googlemerchant.xml';
const SAIDA_DIR = process.env.SAIDA_DIR || path.join(__dirname, 'publico');
// Se a loja enviar menos itens que isso, algo deu errado: não sobrescreve o feed anterior.
const MINIMO_ITENS = Number(process.env.MINIMO_ITENS || 100);

function valorTag(bloco, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`);
  const m = bloco.match(re);
  return m ? decodificar(m[1].trim()) : null;
}

function todosValores(bloco, tag) {
  const re = new RegExp(`<${tag}>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${tag}>`, 'g');
  return [...bloco.matchAll(re)].map((m) => decodificar(m[1].trim()));
}

function temTag(bloco, tag) {
  return new RegExp(`<${tag}[\\s>]`).test(bloco);
}

function decodificar(t) {
  return t.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&');
}

function escapar(t) {
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function precoXml(valor) {
  return `${valor.toFixed(2)} BRL`;
}

function trocarTag(corpo, tag, valor) {
  const re = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`);
  if (re.test(corpo)) return corpo.replace(re, `<${tag}>${valor}</${tag}>`);
  return corpo.replace(/(<g:price>[\s\S]*?<\/g:price>)/, `$1\n      <${tag}>${valor}</${tag}>`);
}

function processarXml(xml, promocoes = new Map()) {
  const relatorio = {
    gerado_em: new Date().toISOString(),
    total_itens: 0,
    adicionados: { size: 0, color: 0, gender: 0, age_group: 0 },
    ja_existiam: { size: 0, color: 0, gender: 0, age_group: 0 },
    sem_tamanho: 0,
    sem_cor: 0,
    exemplos_sem_tamanho: [],
    exemplos_sem_cor: [],
    rotulos: { custom_label_0: {}, custom_label_1: {}, custom_label_2: {} },
    promocoes: { produtos_lidos: promocoes.size, itens_com_de_por: 0, preco_diferente_do_site: 0, exemplos: [] },
  };

  const novo = xml.replace(/<item>([\s\S]*?)<\/item>/g, (inteiro, corpoOriginal) => {
    relatorio.total_itens++;
    let corpo = corpoOriginal;
    const dados = {
      id: valorTag(corpo, 'g:id'),
      item_group_id: valorTag(corpo, 'g:item_group_id'),
      title: valorTag(corpo, 'title'),
      product_type: todosValores(corpo, 'g:product_type'),
    };
    // Promoção: só troca quando o preço do XML bate com o "por" do site,
    // para nunca anunciar um preço diferente do que a loja cobra.
    const promo = dados.item_group_id && promocoes.get(dados.item_group_id);
    if (promo) {
      const precoLoja = parseFloat(valorTag(corpo, 'g:price'));
      if (Math.abs(precoLoja - promo.por) < 0.01) {
        corpo = trocarTag(corpo, 'g:price', precoXml(promo.de));
        corpo = trocarTag(corpo, 'g:sale_price', precoXml(promo.por));
        relatorio.promocoes.itens_com_de_por++;
        if (relatorio.promocoes.exemplos.length < 10) {
          relatorio.promocoes.exemplos.push(`${dados.id} | de ${promo.de.toFixed(2)} por ${promo.por.toFixed(2)}`);
        }
      } else {
        relatorio.promocoes.preco_diferente_do_site++;
      }
    }

    const extra = enriquecer(dados);
    const novasTags = [];

    for (const campo of ['size', 'color', 'gender', 'age_group']) {
      if (temTag(corpo, `g:${campo}`)) {
        relatorio.ja_existiam[campo]++;
        continue;
      }
      if (extra[campo]) {
        novasTags.push(`<g:${campo}>${escapar(extra[campo])}</g:${campo}>`);
        relatorio.adicionados[campo]++;
      }
    }
    const rotulos = rotular({ title: dados.title, price: valorTag(corpo, 'g:price'), sale_price: valorTag(corpo, 'g:sale_price') });
    for (const [campo, valor] of Object.entries(rotulos)) {
      if (!valor || temTag(corpo, `g:${campo}`)) continue;
      novasTags.push(`<g:${campo}>${escapar(valor)}</g:${campo}>`);
      relatorio.rotulos[campo][valor] = (relatorio.rotulos[campo][valor] || 0) + 1;
    }

    if (!extra.size && !temTag(corpo, 'g:size')) {
      relatorio.sem_tamanho++;
      if (relatorio.exemplos_sem_tamanho.length < 30) relatorio.exemplos_sem_tamanho.push(`${dados.id} | ${dados.title}`);
    }
    if (!extra.color && !temTag(corpo, 'g:color')) {
      relatorio.sem_cor++;
      if (relatorio.exemplos_sem_cor.length < 30) relatorio.exemplos_sem_cor.push(`${dados.id} | ${dados.title}`);
    }

    if (!novasTags.length) return corpo === corpoOriginal ? inteiro : `<item>${corpo}</item>`;
    // Mantém o recuo usado pela loja
    const recuo = (corpo.match(/\n([ \t]+)<[^/]/) || [, '      '])[1];
    const fechamento = corpo.match(/\n?[ \t]*$/)[0];
    return `<item>${corpo.slice(0, corpo.length - fechamento.length)}\n${novasTags.map((t) => recuo + t).join('\n')}${fechamento}</item>`;
  });

  return { xml: novo, relatorio };
}

async function obterXmlOrigem() {
  const i = process.argv.indexOf('--arquivo');
  if (i !== -1) return fs.readFileSync(process.argv[i + 1], 'utf8');
  let status;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    const resp = await fetch(FEED_URL, { headers: { ...CABECALHOS, Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8' } });
    if (resp.ok) return await resp.text();
    status = resp.status;
    await new Promise((r) => setTimeout(r, 5000 * tentativa));
  }
  throw new Error(`Não consegui baixar o XML da loja (HTTP ${status})`);
}

async function main() {
  const origem = await obterXmlOrigem();
  const { mapa, resumo } = await lerPromocoes();
  const { xml, relatorio } = processarXml(origem, mapa);
  relatorio.promocoes.leitura = resumo;

  if (relatorio.total_itens < MINIMO_ITENS) {
    throw new Error(`O XML da loja veio com só ${relatorio.total_itens} itens. Feed anterior mantido por segurança.`);
  }

  fs.mkdirSync(SAIDA_DIR, { recursive: true });
  fs.writeFileSync(path.join(SAIDA_DIR, 'feed-google.xml'), xml);
  fs.writeFileSync(path.join(SAIDA_DIR, 'relatorio.json'), JSON.stringify(relatorio, null, 2));

  const pct = (n) => `${((100 * n) / relatorio.total_itens).toFixed(1)}%`;
  console.log(`Itens no feed: ${relatorio.total_itens}`);
  console.log(`Com tamanho:   ${pct(relatorio.total_itens - relatorio.sem_tamanho)}`);
  console.log(`Com cor:       ${pct(relatorio.total_itens - relatorio.sem_cor)}`);
  console.log(`Promoções:     ${relatorio.promocoes.itens_com_de_por} itens com de/por (${mapa.size} produtos lidos${resumo.erro ? `, erro: ${resumo.erro}` : ''})`);
  console.log(`Feed salvo em ${path.join(SAIDA_DIR, 'feed-google.xml')}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { processarXml };
