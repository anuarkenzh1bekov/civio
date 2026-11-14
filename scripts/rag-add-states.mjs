// One-off import of the Florida, Washington and New York sources into corpus.json.
// Reads pages saved by the fetch step in the directory given as the first argument.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { htmlText } from './rag-ingest.mjs';
import { digest } from '../src/lib/rag/core.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = process.argv[2];
const FL = 'https://www.leg.state.fl.us/statutes/index.cfm?App_mode=Display_Statute&URL=';
const DOCS = [
  { id: 'fl-83.49', file: 'fl83', state: 'FL', kind: 'statute', title: 'Florida Statutes §83.49 — Deposit money or advance rent; duty of landlord and tenant', url: `${FL}0000-0099/0083/Sections/0083.49.html`, mode: 'fl' },
  { id: 'fl-320.02', file: 'fl320_02', state: 'FL', kind: 'statute', title: 'Florida Statutes §320.02 — Registration required; application for registration', url: `${FL}0300-0399/0320/Sections/0320.02.html`, mode: 'fl' },
  { id: 'fl-320.38', file: 'fl320', state: 'FL', kind: 'statute', title: 'Florida Statutes §320.38 — When nonresident exemption does not apply', url: `${FL}0300-0399/0320/Sections/0320.38.html`, mode: 'fl' },
  { id: 'fl-322.031', file: 'fl322', state: 'FL', kind: 'statute', title: 'Florida Statutes §322.031 — Nonresident driver license exemption', url: `${FL}0300-0399/0322/Sections/0322.031.html`, mode: 'fl' },
  { id: 'fl-324.022', file: 'fl324', state: 'FL', kind: 'statute', title: 'Florida Statutes §324.022 — Financial responsibility for property damage', url: `${FL}0300-0399/0324/Sections/0324.022.html`, mode: 'fl' },
  { id: 'fl-627.733', file: 'fl627_733', state: 'FL', kind: 'statute', title: 'Florida Statutes §627.733 — Required security (no-fault insurance)', url: `${FL}0600-0699/0627/Sections/0627.733.html`, mode: 'fl' },
  { id: 'wa-46.20.021', file: 'wa4620', state: 'WA', kind: 'statute', title: 'RCW 46.20.021 — New residents (driver license)', url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.20.021', mode: 'wa' },
  { id: 'wa-46.16A.140', file: 'wa46', state: 'WA', kind: 'statute', title: 'RCW 46.16A.140 — Vehicle registration for new residents', url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.16A.140', mode: 'wa' },
  { id: 'wa-46.30.020', file: 'wa4630', state: 'WA', kind: 'statute', title: 'RCW 46.30.020 — Financial responsibility (auto insurance)', url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=46.30.020', mode: 'wa' },
  { id: 'wa-59.18.280', file: 'wa59', state: 'WA', kind: 'statute', title: 'RCW 59.18.280 — Residential security deposits', url: 'https://app.leg.wa.gov/RCW/default.aspx?cite=59.18.280', mode: 'wa' },
  { id: 'ny-dmv-moving', file: 'nymove', state: 'NY', kind: 'agency-guidance', title: 'New York DMV — Moving to or from New York State', url: 'https://dmv.ny.gov/more-info/moving-to-or-from-new-york-state', mode: 'main' },
  { id: 'ny-dmv-register-out-of-state', file: 'nyoos', state: 'NY', kind: 'agency-guidance', title: 'New York DMV — Register an out-of-state vehicle', url: 'https://dmv.ny.gov/registration/register-an-out-of-state-vehicle', mode: 'main' },
  { id: 'ny-dmv-driving', file: 'nyd', state: 'NY', kind: 'agency-guidance', title: 'New York DMV — Driving in New York State', url: 'https://dmv.ny.gov/driver-license/driving-in-new-york-state', mode: 'main' },
  { id: 'ny-tax-it203', file: 'it203', state: 'NY', kind: 'agency-guidance', title: 'New York Tax Dept — IT-203 nonresident and part-year resident return', url: 'https://www.tax.ny.gov/pit/ads/it203_information.htm', mode: 'main' },
];

function extract(doc, html) {
  if (doc.mode === 'fl') {
    const start = html.indexOf('<div class="Section">');
    const end = html.indexOf('<div class="Note"', start);
    return htmlText(html.slice(start, end > 0 ? end : start + 60000));
  }
  if (doc.mode === 'wa') {
    const start = html.indexOf("id='contentWrapper'");
    const end = html.indexOf('</div></div></div>', start);
    return htmlText(html.slice(start, end > 0 ? end : start + 60000));
  }
  const body = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] ?? html;
  return htmlText(body);
}

const target = resolve(root, 'data/rag/corpus.json');
const corpus = JSON.parse(await readFile(target, 'utf8'));
await mkdir(resolve(root, 'data/rag/raw'), { recursive: true });
const retrievedAt = new Date().toISOString();
for (const doc of DOCS) {
  const html = await readFile(resolve(dir, `${doc.file}.html`), 'utf8');
  const text = extract(doc, html);
  if (text.length < 300) throw new Error(`${doc.id}: too short (${text.length})`);
  if (/just a moment|access denied/i.test(text.slice(0, 200))) throw new Error(`${doc.id}: blocked`);
  const entry = { state: doc.state, kind: doc.kind, retrievedAt, retrievalMethod: 'web-extract', rawFile: `raw/${doc.id}.txt`, rawSha256: digest(html), id: doc.id, title: doc.title, url: doc.url, text };
  await writeFile(resolve(root, `data/rag/raw/${doc.id}.txt`), text);
  corpus.documents = corpus.documents.filter(d => d.id !== doc.id);
  corpus.documents.push(entry);
  console.log(doc.id, text.length);
}
// NY security deposit rule: Attorney General tenants' rights guide (PDF, text via pdftotext).
const raw = execFileSync('pdftotext', ['-layout', resolve(dir, 'tenants.pdf'), '-'], { maxBuffer: 64e6 }).toString().replace(/\s+/g, ' ');
const dep = raw.match(/[^.]{0,300}return the security deposit within 14 days[\s\S]{0,1100}/i);
if (dep) {
  const text = "New York Attorney General, Residential Tenants' Rights Guide, security deposits: " + dep[0].trim();
  corpus.documents = corpus.documents.filter(d => d.id !== 'ny-ag-deposit');
  corpus.documents.push({ state: 'NY', kind: 'agency-guidance', retrievedAt, retrievalMethod: 'web-extract', rawFile: 'raw/ny-ag-deposit.txt', rawSha256: digest(raw), id: 'ny-ag-deposit', title: "New York Attorney General — Residential Tenants' Rights Guide (security deposits)", url: 'https://ag.ny.gov/sites/default/files/tenants_rights.pdf', text });
  await writeFile(resolve(root, 'data/rag/raw/ny-ag-deposit.txt'), text);
  console.log('ny-ag-deposit', text.length);
} else console.log('deposit passage not found');
corpus.version = (corpus.version || 1) + 1;
corpus.scope = 'Curated relocation sources for TX, CA, FL, WA and NY; not complete state codes';
await writeFile(target, JSON.stringify(corpus, null, 2));
console.log('documents', corpus.documents.length);
