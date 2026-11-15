# Law RAG: Texas, California, Florida, Washington and New York

A small, curated collection for one scenario: moves between five states: Texas, California, Florida, Washington and New York. It holds the statute sections and agency pages behind the tasks in a moving plan, and nothing else. It is **not** the complete law of either state.

51 documents, 191 overlapping chunks, every chunk embedded. `corpus.json` holds the text and provenance, `index.json` the Gemini vectors. Both are committed and deployed with the app; together they are about 2 MB.

## What is in it

| Topic | Texas | California |
|---|---|---|
| Driver license | Transp. Code §§521.021, 521.029 (new residents), 521.054 (address change), 521.142, 521.144 | Veh. Code §§12500, 12505 (residency); DMV new-resident portal; DMV FFDL 5 (revision June 2020) |
| Vehicle registration | Transp. Code §502.040; TxDMV "New to Texas" | Veh. Code §§4000, 4152.5, 6700; DMV nonresident privileges |
| Address change | Transp. Code §521.054 | Veh. Code §14600 |
| Auto insurance | Transp. Code §§601.051, 601.072 | Veh. Code §§16020, 16056 |
| Income tax residency | (no state income tax) | Rev. & Tax. Code §§17014, 17016, 17041; FTB part-year resident page |
| Health coverage | | Covered California special enrollment |
| School enrollment | | Educ. Code §§48000, 48200, 48204; Health & Safety Code §120335 (immunizations) |
| Leaving a rental | Property Code §§91.001, 92.103, 92.107 | Civil Code §§1946, 1950.5 |
| Voter registration | Election Code §15.0215 | Elections Code §2101 |

Statutes marked `retrievalMethod: "bulk-archive"` were copied once from the official bulk downloads (statutes.capitol.texas.gov and downloads.leginfo.legislature.ca.gov). California entries keep `effectiveDate` and `history` from the archive. Retrieval date means downloaded, not independently verified as current law.

Not covered: Texas school and immunization sections (missing from the archive import), federal law, regulations, local ordinances, case law, and anything unrelated to moving.

## Added for the five-state MVP

| Topic | Florida | Washington | New York |
|---|---|---|---|
| Driver license | Stat. §322.031 (30 days) | RCW 46.20.021 (30 days) | DMV "Driving in New York State" (30 days) |
| Vehicle registration | Stat. §§320.02, 320.38 (10 days) | RCW 46.16A.140 (30 days) | DMV "Register an out-of-state vehicle" (30 days) |
| Auto insurance | Stat. §§324.022, 627.733 | RCW 46.30.020 | (inside the DMV registration page) |
| Rental deposit | Stat. §83.49 (15 / 30 days) | RCW 59.18.280 (30 days) | Attorney General tenants' rights guide (14 days) |
| Income tax | not covered | not covered | Tax Dept IT-203 page |

Florida and Washington statutes and the New York pages were fetched from official sites on the retrieval date (`retrievalMethod: "web-extract"`, text in `raw/`). The New York GOL §7-108 text could not be fetched (the site blocks automated requests), so the deposit rule comes from the Attorney General's guide. Not covered for these three states: schools, voter registration, health coverage, state income tax rules for Florida and Washington.

## Retrieval

- Chunks of 280 words with 45-word overlap, stable content-hashed IDs.
- `gemini-embedding-001`, 768 dimensions, `RETRIEVAL_DOCUMENT` for chunks and `RETRIEVAL_QUERY` for questions.
- Okapi BM25 (k1=1.5, b=0.75) over the same chunks.
- **Score = 0.70 × cosine + 0.30 × BM25 normalized to the best match.** Cosine must be at least 0.50, so unrelated questions return nothing.
- At most six passages, three per document. A state named in the question overrides the profile's states.
- Without a key or when embedding fails, search falls back to BM25 only and says so.

## Rebuild and verify

Run from `backend/`, with the virtual environment active (or prefix each command with `uv run`). `rag_build` and `rag_eval` need `GOOGLE_API_KEY`, from the environment or `backend/.env`.

```sh
python -m scripts.rag_ingest  # re-download the directly fetchable pages; other snapshots are kept
python -m scripts.rag_build   # embed new or changed chunks only
python -m scripts.rag_eval    # 25 real English questions, including off-topic and unsupported-state ones
python -m pytest tests/test_rag.py  # unit tests for BM25, fusion, chunking, ingestion, index freshness
```

To add a source, add it to `SOURCES` in `scripts/rag_ingest.py` (or a document to `corpus.json`), then run `rag_build` and add an eval question to `scripts/rag_eval.py`.
