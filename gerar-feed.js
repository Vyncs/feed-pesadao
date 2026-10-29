#!/usr/bin/env node
// Lê o XML que a Loja Integrada gera para o Google e completa os campos
// que faltam (tamanho, cor, gênero e faixa etária).
// Não muda IDs, preços, estoque nem links: esses continuam vindo da loja.
//
// Uso:
//   node gerar-feed.js                       (baixa o XML da loja)
//   node gerar-feed.js --arquivo origem.xml  (usa um arquivo local)
//   Saída: publico/feed-google.xml e publico/relatorio.json

const fs = require('fs');
const path = require('path');
const { enriquecer } = require('./lib/enriquecer');

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

function processarXml(xml) {
  const relatorio = {
    gerado_em: new Date().toISOString(),
    total_itens: 0,
    adicionados: { size: 0, color: 0, gender: 0, age_group: 0 },
    ja_existiam: { size: 0, color: 0, gender: 0, age_group: 0 },
    sem_tamanho: 0,
    sem_cor: 0,
    exemplos_sem_tamanho: [],
    exemplos_sem_cor: [],
  };

  const novo = xml.replace(/<item>([\s\S]*?)<\/item>/g, (inteiro, corpo) => {
    relatorio.total_itens++;
    const dados = {
      id: valorTag(corpo, 'g:id'),
      item_group_id: valorTag(corpo, 'g:item_group_id'),
      title: valorTag(corpo, 'title'),
      product_type: todosValores(corpo, 'g:product_type'),
    };
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
    if (!extra.size && !temTag(corpo, 'g:size')) {
      relatorio.sem_tamanho++;
      if (relatorio.exemplos_sem_tamanho.length < 30) relatorio.exemplos_sem_tamanho.push(`${dados.id} | ${dados.title}`);
    }
    if (!extra.color && !temTag(corpo, 'g:color')) {
      relatorio.sem_cor++;
      if (relatorio.exemplos_sem_cor.length < 30) relatorio.exemplos_sem_cor.push(`${dados.id} | ${dados.title}`);
    }

    if (!novasTags.length) return inteiro;
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
  const resp = await fetch(FEED_URL, { headers: { 'User-Agent': 'feed-pesadao/1.0' } });
  if (!resp.ok) throw new Error(`Não consegui baixar o XML da loja (HTTP ${resp.status})`);
  return await resp.text();
}

async function main() {
  const origem = await obterXmlOrigem();
  const { xml, relatorio } = processarXml(origem);

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
  console.log(`Feed salvo em ${path.join(SAIDA_DIR, 'feed-google.xml')}`);
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

module.exports = { processarXml };
