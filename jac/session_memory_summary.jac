import from byllm.lib { Model }

glob llm = Model(model_name="gemini/gemini-2.5-flash");

obj InteractionTurn {
    has user_text: str;
    has model_text: str;
    has artifact_types: list[str] = [];
}

sem InteractionTurn.user_text = "The user's question or instruction for a completed turn.";
sem InteractionTurn.model_text = "The assistant's final response for the same turn.";
sem InteractionTurn.artifact_types = "UI artifacts active during the turn, such as focus-box, draw-stroke, or laser-trail.";

def summarize_session_context(turns: list[InteractionTurn], max_turns: int = 3) -> str by llm();
sem summarize_session_context = "Summarize recent session memory turns for reuse as concise assistant context. Keep concrete details, mention artifact types only when relevant, and stay under 120 words.";

def fallback_session_context(turns: list[InteractionTurn], max_turns: int = 3) -> str {
    recent = turns[-max_turns:];
    return "\n---\n".join(
        [
            "\n".join(
                [part for part in [
                    f"User: {turn.user_text}" if turn.user_text else "",
                    f"Assistant: {turn.model_text}" if turn.model_text else "",
                    f"[Artifacts: {', '.join(turn.artifact_types)}]" if turn.artifact_types else ""
                ] if part]
            )
            for turn in recent
        ]
    );
}

with entry {
    turns = [
        InteractionTurn(
            user_text="How many errors are visible?",
            model_text="I can see three errors in the current panel.",
        ),
        InteractionTurn(
            user_text="Show me the top navigation button.",
            model_text="The blue button is in the top bar near the left side.",
            artifact_types=["focus-box"],
        ),
    ];

    try {
        print(summarize_session_context(turns, 2));
    } except Exception as e {
        print(fallback_session_context(turns, 2));
        print(f"\n[byLLM fallback: {e}]");
    }
}
