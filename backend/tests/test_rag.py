import json
import math

import httpx
import pytest

from app.rag.core import bm25, chunk_documents, cosine, hybrid_search, select_states, tokenize
from app.rag.embeddings import embed_texts
from app.rag.retrieve import DATA_DIR, corpus_hash, evidence_fallback, load_index, retrieve_evidence
from scripts.rag_ingest import extract_documents, html_text


@pytest.fixture
def anyio_backend():
    return "asyncio"


def chunk(id, text, embedding, state="CA"):
    return {"id": id, "documentId": id, "title": "", "text": text, "embedding": embedding, "state": state}


def test_bm25_uses_frequency_document_frequency_and_length():
    scores = bm25("license", ["license license", "license " + "irrelevant " * 40, "health insurance"])
    assert scores[0] > scores[1]
    assert scores[2] == 0
    single = bm25("license", ["license"])[0]
    assert abs(single - math.log(1 + 0.5 / 1.5)) < 1e-10


def test_fusion_can_rank_a_semantic_match_over_a_lexical_match():
    chunks = [chunk("semantic", "residency", [1, 0]), chunk("lexical", "license", [0.6, 0.8])]
    hits = hybrid_search(chunks, "license", [1, 0])
    assert hits[0]["chunk"]["id"] == "lexical"  # .7*.6 + .3*1 = .72 versus .7
    assert abs(hits[0]["score"] - 0.72) < 1e-12
    stronger = hybrid_search([chunks[0], chunk("lexical", "license", [0.5, math.sqrt(0.75)])], "license", [1, 0])
    assert stronger[0]["chunk"]["id"] == "semantic"


def test_unrelated_lexical_questions_do_not_inherit_profile_relevance():
    assert hybrid_search([chunk("car", "driver license", [1, 0])], "cook pasta", None) == []


def test_semantic_threshold_rejects_unrelated_queries_even_if_a_common_word_matches():
    assert hybrid_search([chunk("car", "license", [0, 1])], "license", [1, 0]) == []


def test_explicit_jurisdiction_overrides_profile_including_russian():
    assert select_states("Права в Техасе", {"destinationState": "CA"}) == ["TX"]
    hits = hybrid_search([chunk("ca", "license", [1, 0]), chunk("tx", "license", [1, 0], "TX")], "license", [1, 0], states=["TX"])
    assert [h["chunk"]["id"] for h in hits] == ["tx"]
    assert select_states("license", {"destinationState": "NY"}) == ["NY"]
    assert select_states("driver license in New York", {"destinationState": "CA"}) == ["NY"]


def test_state_codes_follow_the_javascript_patterns():
    # "CA"/"TX" match in any case as whole words; other codes only after in/to/from/state of.
    assert select_states("moving to ca", None) == ["CA"]
    assert select_states("is it OK to drive", {"currentState": "TX", "destinationState": "TX"}) == ["TX"]
    assert select_states("moving from WA to Калифорнию", None) == ["CA", "WA"]
    assert select_states("Переезд в Нью-Йорк", None) == ["NY"]
    assert select_states("anything", None) == []


def test_unicode_tokenization_retains_russian_and_statute_numbers():
    assert "права" in tokenize("права 521.029")
    assert "521.029" in tokenize("права 521.029")


def test_chunking_has_stable_ids_bounded_size_overlap_and_full_coverage():
    doc = {"id": "d", "text": " ".join(f"w{i}" for i in range(700))}
    chunks = chunk_documents([doc])
    assert len(chunks) == 3
    assert all(len(c["text"].split(" ")) <= 280 for c in chunks)
    assert chunks[1]["text"].startswith("w235 ")
    assert chunks[-1]["text"].endswith("w699")
    assert chunks[0]["id"] == chunk_documents([doc])[0]["id"]


def test_statutes_are_cut_on_subsection_boundaries_not_mid_sentence():
    def sub(letter, n):
        return " ".join([f"({letter})", *(f"{letter}{i}" for i in range(n))])

    text = " ".join(["Sec. 1.", sub("a", 100), sub("b", 100), "see subdivision (a) here", sub("c", 150), sub("d", 400)])
    chunks = chunk_documents([{"id": "s", "kind": "statute", "text": text}])
    assert chunks[0]["text"].startswith("Sec. 1. (a)")
    assert "(b) b0" in chunks[0]["text"] and "subdivision (a) here" in chunks[0]["text"]
    assert chunks[1]["text"].startswith("(c) c0") and chunks[1]["text"].endswith("c149")
    assert all(len(c["text"].split(" ")) <= 280 for c in chunks[2:])
    words = {w for c in chunks for w in c["text"].split(" ")}
    assert all(w in words for w in text.split(" "))


def test_cosine_rejects_dimension_mismatch():
    with pytest.raises(ValueError):
        cosine([1, 0], [1])
    assert cosine([2, 0], [5, 0]) == 1


def test_ingestion_strips_scripts_and_extracts_exact_statute_boundaries():
    assert html_text("<p>A &amp; B</p><script>bad</script>") == "A & B"
    a, b = "First section " * 20, "Second section " * 20
    docs = extract_documents(
        {"id": "tx", "title": "Law", "sections": ["521.029"], "url": "https://example.gov"},
        f'<a name="521.029"></a><p>{a}</p><a name="521.030"></a><p>{b}</p>',
    )
    assert "First" in docs[0]["text"]
    assert "Second" not in docs[0]["text"]
    with pytest.raises(ValueError):
        extract_documents({"id": "x", "sections": ["521.029"]}, "Access denied")


@pytest.mark.anyio
async def test_embedding_requests_use_retrieval_task_fixed_dimensions_and_validate_output():
    sent = {}

    def good(request: httpx.Request) -> httpx.Response:
        sent.update(json.loads(request.content))
        sent["key"] = request.headers.get("x-goog-api-key")
        return httpx.Response(200, json={"embeddings": [{"values": [2 if i == 0 else 0 for i in range(768)]}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(good)) as client:
        vectors = await embed_texts(["hello"], "RETRIEVAL_QUERY", api_key="test-only", client=client)
    assert sent["requests"][0]["taskType"] == "RETRIEVAL_QUERY"
    assert sent["requests"][0]["outputDimensionality"] == 768
    assert sent["key"] == "test-only"
    assert vectors[0][0] == 1

    bad = httpx.MockTransport(lambda request: httpx.Response(200, json={"embeddings": [{"values": [1]}]}))
    async with httpx.AsyncClient(transport=bad) as client:
        with pytest.raises(ValueError):
            await embed_texts(["hello"], "RETRIEVAL_DOCUMENT", api_key="test-only", client=client)


def test_committed_index_is_fresh_for_the_python_chunker():
    """The index was built by the JavaScript code: the hash, ids and texts must come out identical here."""
    corpus = json.loads((DATA_DIR / "corpus.json").read_text(encoding="utf-8"))
    index = json.loads((DATA_DIR / "index.json").read_text(encoding="utf-8"))
    assert corpus_hash(corpus["documents"]) == index["corpusHash"]
    expected = chunk_documents(corpus["documents"])
    assert [c["id"] for c in expected] == [c["id"] for c in index["chunks"]]
    assert [c["text"] for c in expected] == [c["text"] for c in index["chunks"]]
    loaded = load_index()
    assert loaded["indexed"] is True
    assert len(loaded["chunks"]) == len(index["chunks"])
    assert all(len(c["embedding"]) == 768 for c in loaded["chunks"])


@pytest.mark.anyio
async def test_retrieval_without_a_key_falls_back_to_keyword_search(monkeypatch):
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
    result = await retrieve_evidence("How many days do I have to register my car after moving to Texas?", None)
    assert result["mode"] == "bm25"
    assert result["notice"] == "Semantic search is unavailable; these results use keyword search only."
    assert result["hits"] and all(hit["chunk"]["state"] == "TX" for hit in result["hits"])
    assert evidence_fallback(result["hits"]).startswith("Relevant official-source excerpts (not an AI answer):")
    assert "does not contain a sufficiently relevant passage" in evidence_fallback([])
