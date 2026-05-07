# Mind Palace — Feature Roadmap

> Leveraging Gemini Embedding 2 capabilities for Tana's persistent semantic memory system.

## Current State (Phases 1–4 Complete)

Mind Palace captures screenshots + focus regions every second, embeds them multimodally via Gemini Embedding 2 Preview (images + text → 3072-dim vectors), stores in SQLite with images on disk, and provides semantic search + interactive 3D UMAP visualization. ~888 lines of production code.

### Gemini Embedding 2 Capabilities Not Yet Leveraged

| Capability | Details |
|---|---|
| **Video** | Up to 120s, 32 frames, MP4/MOV |
| **Documents/PDF** | Up to 6 pages per embedding call |
| **Audio** | Up to 80s, MP3/WAV |
| **Matryoshka Dimensions** | Flexible 128–3072 dims (currently fixed at 3072) |
| **Task Types** | Similarity, classification, clustering, retrieval, QA, fact-verification |

---

## Priority 1 — Implement Now

### Video Context Batching

**Problem:** Per-second screenshot embedding lacks temporal context and burns 1 API call/second. Individual frames miss transitions, workflows, and the flow of activity.

**Solution:** Buffer captured screenshots into 30-second video clips and embed each clip as a single video embedding.

- **Window size:** 30 seconds (~2 API calls/min instead of 60)
- **Overlap:** 5–10 second overlap between consecutive windows so no moment falls at a boundary without context
- **Transcription:** Text from the live model during each window period gets bundled with the video embedding
- **Encoding:** TBD (options: MediaRecorder API, ffmpeg.wasm, native ffmpeg binary)
- **Fallback:** Degrades to current per-frame approach if video encoding fails
- **Deduplication:** Search results from overlapping windows deduplicated by timestamp proximity

**Impact:** ~30x reduction in API calls. Richer temporal context per embedding — the model sees workflows and transitions, not isolated snapshots.

---

### Document Ingestion — "Feed Your Palace"

**Problem:** Mind Palace is currently a passive screen recorder. Users can't manually add reference material like lecture PDFs, API docs, or research papers.

**Solution:** Drag-and-drop or file picker UI for PDF ingestion directly into the Mind Palace.

- Gemini Embedding 2 supports up to 6 PDF pages per embedding call
- Large documents: chunk into 6-page sliding windows with 1–2 page overlap
- Store PDFs in `mind-palace/documents/` with metadata in SQLite
- Each chunk becomes a `MemoryRecord` with type `"document"` (vs `"capture"`)
- Fully searchable alongside auto-captured memories in the same unified embedding space

**Impact:** Transforms Mind Palace from passive recorder into an active knowledge base. Students ingest lecture materials, developers add API docs — all semantically searchable alongside live workflow captures.

---

## Priority 2 — Near-Term

### Cross-Modal Image Search

**Problem:** Users can only search by text. The unified embedding space already supports image→memory similarity, but there's no UI for it.

**Solution:** Add image upload (paste or file picker) to the search bar. Embed the uploaded image via `embedMultimodal`, search against the vector index. Results surface visually similar memories regardless of transcription text.

**Use case:** "I saw a diagram like this last week" → paste a screenshot → find the original context.

---

### Memory Consolidation — "Sleep Cycles"

**Problem:** 8 hours of capture generates ~960 video clips (at 30s windows). Raw captures are noisy — many are near-duplicates or low-signal. This degrades RAG retrieval quality.

**Solution:** Periodic consolidation that mimics human memory processing:

1. Cluster similar memories using DBSCAN on the embedding space
2. For each cluster, generate a summary (text + representative screenshot) using Gemini
3. Embed the summary as a new "consolidated" memory
4. Archive constituent memories (keep in DB but exclude from primary search index)
5. Consolidated memories become the canonical search targets

**Impact:** Dramatically improves RAG retrieval quality. Reduces noise in search results. Keeps the vector index lean for fast search.

---

## Priority 3 — Later Steps

### Matryoshka Adaptive Search

Use smaller embedding dimensions for fast approximate search, full 3072 for precision re-ranking. First pass with 256-dim (just truncate the vector — that's how Matryoshka works) finds top-50 candidates, then re-rank with full 3072-dim for final top-10.

**Impact:** ~12x faster approximate search. Enables scaling to 100K+ memories without an external vector DB. UMAP projection can handle 4x more points at 768-dim.

---

### Auto Topic Clustering

Run periodic clustering on the embedding space to automatically discover "topics" the user worked on. Generate natural-language summaries: *"You spent 2.5 hours on React component refactoring across Tuesday and Wednesday."*

Pairs well with the JAC session summarizer (`jac/session_memory_summary.jac`).

---

### Tiered Memory Compression

Age out older memories to lower dimensions:
- Recent (< 7 days): full 3072-dim
- Medium (7–30 days): 768-dim
- Old (> 30 days): 256-dim

4–12x storage reduction for historical memories while maintaining searchability.

---

### Shared Memory Spaces

Multiple users working on the same project opt into a shared Mind Palace region. Personal captures stay private; explicitly starred/bookmarked memories enter the shared space.

---

### Thought Trail Visualization

Draw temporal paths through the 3D UMAP space connecting chronologically sequential memories. Users see their "thought trajectory" — when they went deep, when they context-switched, when they jumped between topics.

A fun, visual gimmick that doubles as a meta-cognitive tool.

---

## Dropped Features

| Feature | Reason |
|---|---|
| **Audio Memory** | Redundant — the live model already provides input/output transcription, so speech content is captured as text. Audio embedding would just add storage overhead. |
| **Déjà Vu Detection** | Not compelling enough for course scope. |
| **Task-Type Optimized Queries** | Marginal improvement vs. implementation complexity. |

---

## Phase 5 Polish (Parallel Track)

These items from the original Phase 5 remain pending alongside the new features:

- DB schema migrations
- Data export/import UI
- Memory deletion UI (per-memory and bulk)
- Storage quota warnings
- Performance optimization for 10K+ memories
