import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest } from '../src/lib/rag/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCES = [
  { id: 'tx-licenses', state: 'TX', kind: 'statute', title: 'Texas Transportation Code Chapter 521',
    url: 'https://tcss.legis.texas.gov/resources/TN/htm/TN.521.htm', sections: ['521.029', '521.054', '521.142', '521.144'] },
  { id: 'tx-registration', state: 'TX', kind: 'statute', title: 'Texas Transportation Code Chapter 502',
    url: 'https://tcss.legis.texas.gov/resources/TN/htm/TN.502.htm', sections: ['502.040'] },
  { id: 'tx-new-residents', state: 'TX', kind: 'agency-guidance', title: 'Texas DMV — New to Texas',
    url: 'https://www.txdmv.gov/motorists/new-to-texas', element: 'article' },
  { id: 'ca-residency-tax', state: 'CA', kind: 'agency-guidance', title: 'California FTB — Part-year residents and nonresidents',
    url: 'https://www.ftb.ca.gov/file/personal/residency-status/part-year-and-nonresident.html', element: 'main' },
  { id: 'ca-health-enrollment', state: 'CA', kind: 'agency-guidance', title: 'Covered California — Special enrollment',
    url: 'https://www.coveredca.com/special-enrollment/', element: 'main' },
];

export function htmlText(html) {
  const entities = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', ndash: '–', mdash: '—' };
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|nav|footer|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (match, code) => {
      if (code[0] !== '#') return entities[code.toLowerCase()] ?? match;
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : match;
    }).replace(/\s+/g, ' ').trim();
}

export function extractDocuments(source, html, retrievedAt = new Date().toISOString()) {
  const metadata = { state: source.state, kind: source.kind, retrievedAt, retrievalMethod: 'direct-http',
    rawFile: `raw/${source.id}.html`, rawSha256: digest(html) };
  if (source.sections) return source.sections.map(section => {
    const anchor = `<a name="${section}">`;
    const start = html.indexOf(anchor);
    if (start < 0) throw new Error(`Section ${section} missing`);
    const tail = html.slice(start + anchor.length);
    const next = tail.search(/<a name="\d{3}\.\d{3,}"/);
    const text = htmlText(next < 0 ? tail : tail.slice(0, next));
    if (text.length < 100) throw new Error(`Empty section ${section}`);
    return { ...metadata, id: `${source.id}-${section}`, title: `${source.title} §${section}`,
      url: `${source.url}#${section}`, text };
  });
  const body = html.match(new RegExp(`<${source.element}\\b[^>]*>([\\s\\S]*?)<\\/${source.element}>`, 'i'))?.[1];
  if (!body) throw new Error(`Content element missing for ${source.id}`);
  const text = htmlText(body);
  if (text.length < 200 || /access denied|just a moment|captcha/i.test(text.slice(0, 300))) throw new Error(`Unusable source ${source.id}`);
  return [{ ...metadata, id: source.id, title: source.title, url: source.url, text }];
}

export async function ingest({ fetcher = fetch } = {}) {
  const target = resolve(root, 'data/rag/corpus.json');
  let previous = { documents: [] };
  try { previous = JSON.parse(await readFile(target, 'utf8')); } catch { /* first import */ }
  // Snapshots that this script cannot re-download (web extracts, statutes copied from the
  // official bulk archives) are carried over as they are.
  const documents = previous.documents.filter(d => d.retrievalMethod === 'web-extract' || d.retrievalMethod === 'bulk-archive');
  await mkdir(resolve(root, 'data/rag/raw'), { recursive: true });
  const failures = [];
  for (const source of SOURCES) {
    try {
      const response = await fetcher(source.url, { signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const extracted = extractDocuments(source, html);
      await writeFile(resolve(root, `data/rag/raw/${source.id}.html`), html);
      documents.push(...extracted);
    } catch (error) {
      failures.push({ id: source.id, error: error.message });
      // Retain last known good text, without falsely advancing its retrieval date.
      documents.push(...previous.documents.filter(d => d.id === source.id || d.id.startsWith(`${source.id}-`)));
    }
  }
  if (!documents.length) throw new Error('No official source could be downloaded');
  await writeFile(`${target}.tmp`, JSON.stringify({ version: previous.version || 1, scope: previous.scope || 'Curated relocation sources for TX, CA, FL, WA and NY; not complete state codes', documents }, null, 2));
  await rename(`${target}.tmp`, target);
  return { documents: documents.length, failures };
}

if (typeof process !== 'undefined' && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await ingest();
  console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}

