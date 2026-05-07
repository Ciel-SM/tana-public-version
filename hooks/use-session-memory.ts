import { useRef, useCallback } from 'react';
import { InteractionTurn, ArtifactSnapshot } from '../types';

const MAX_TURNS = 50;

/**
 * Local session-scoped semantic memory.
 * Stores interaction turns (user speech + model response + active artifacts).
 * Supports recency-based and lightweight keyword-based retrieval.
 * Designed to be extended with embeddings/vector retrieval later.
 */
export function useSessionMemory() {
  const turnsRef = useRef<InteractionTurn[]>([]);

  const addTurn = useCallback((
    userText: string,
    modelText: string,
    artifacts: ArtifactSnapshot[] = []
  ): string => {
    const turn: InteractionTurn = {
      id: `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userText,
      modelText,
      artifacts,
      timestamp: Date.now(),
    };
    turnsRef.current.push(turn);
    if (turnsRef.current.length > MAX_TURNS) {
      turnsRef.current = turnsRef.current.slice(-MAX_TURNS);
    }
    return turn.id;
  }, []);

  /** Most recent N turns, chronological */
  const getRecentTurns = useCallback((count: number = 5): InteractionTurn[] => {
    return turnsRef.current.slice(-count);
  }, []);

  /** Keyword-ranked turns — recency-boosted, lightweight relevance scoring */
  const getRelevantTurns = useCallback((query: string, count: number = 3): InteractionTurn[] => {
    if (!query.trim()) return turnsRef.current.slice(-count);

    const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 2);

    const scored = turnsRef.current.map(turn => {
      const text = `${turn.userText} ${turn.modelText}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (text.includes(w)) score += 1;
      }
      // Recency bonus: most recent turn gets +1, decays over 10 minutes
      const ageMin = (Date.now() - turn.timestamp) / 60000;
      score += Math.max(0, 1 - ageMin / 10);
      return { turn, score };
    });

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.turn);
  }, []);

  /** Formatted context string suitable for injecting into AI prompts */
  const getContextSummary = useCallback((maxTurns: number = 3): string => {
    const recent = turnsRef.current.slice(-maxTurns);
    if (recent.length === 0) return '';

    return recent.map(t => {
      const parts: string[] = [];
      if (t.userText) parts.push(`User: ${t.userText}`);
      if (t.modelText) parts.push(`Assistant: ${t.modelText}`);
      if (t.artifacts.length > 0) {
        parts.push(`[Artifacts: ${t.artifacts.map(a => a.type).join(', ')}]`);
      }
      return parts.join('\n');
    }).join('\n---\n');
  }, []);

  const clear = useCallback(() => {
    turnsRef.current = [];
  }, []);

  return {
    addTurn,
    getRecentTurns,
    getRelevantTurns,
    getContextSummary,
    clear,
    get turnCount() { return turnsRef.current.length; },
  };
}
