# Jac proof of concept

This is a minimal Jac/byLLM wrapper around one existing text-only behavior from [`useSessionMemory`](/Users/junjia_zheng/Desktop/tana-maydan/eecs449-tana-maydan/hooks/use-session-memory.ts): turning recent interaction turns into reusable context.

Files:

- `session_memory_summary.jac`: defines a Jac `InteractionTurn` object and a `summarize_session_context()` function implemented with `by llm()`.
- `jac.toml`: pins the default byLLM model for this isolated proof of concept.

Run it from this directory:

```bash
cd jac
export GOOGLE_API_KEY="$GEMINI_API_KEY"
jac run session_memory_summary.jac
```

If byLLM cannot reach the model, the sample falls back to the same plain formatted context style the app already uses today.
