import { useState, useCallback } from 'react';
import { Message, Suggestion } from '../types';

/**
 * Generates contextual follow-up suggestion chips after assistant responses.
 * Currently heuristic-based — structured to swap in model-generated suggestions later.
 */
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [visible, setVisible] = useState(false);

  const generateSuggestions = useCallback((messages: Message[]) => {
    const lastModel = [...messages].reverse().find(m => m.role === 'model');
    if (!lastModel || lastModel.text.length < 15) {
      setSuggestions([]);
      setVisible(false);
      return;
    }

    const text = lastModel.text.toLowerCase();
    const result: Suggestion[] = [];
    let id = 0;

    // Context-sensitive heuristics
    if (text.match(/error|issue|bug|problem|fail|broken|wrong/)) {
      result.push({ id: `s${id++}`, text: 'How do I fix this?' });
      result.push({ id: `s${id++}`, text: 'Show me the issue' });
    }
    if (text.match(/chart|graph|data|metric|trend|spike|drop/)) {
      result.push({ id: `s${id++}`, text: 'Explain the trend' });
    }
    if (text.match(/code|function|class|variable|import|module/)) {
      result.push({ id: `s${id++}`, text: 'How can I improve this?' });
    }
    if (text.match(/image|photo|screenshot|design|ui|layout/)) {
      result.push({ id: `s${id++}`, text: 'What could be better?' });
    }
    if (text.length > 250) {
      result.push({ id: `s${id++}`, text: 'Summarize' });
    }

    // Always available
    if (result.length < 3) result.push({ id: `s${id++}`, text: 'Go deeper' });
    if (messages.filter(m => m.role === 'user').length > 1) {
      result.push({ id: `s${id++}`, text: 'Compare with earlier' });
    }
    result.push({ id: `s${id++}`, text: 'What should I do next?' });

    setSuggestions(result.slice(0, 4));
    setVisible(true);
  }, []);

  const dismiss = useCallback(() => {
    setVisible(false);
    setSuggestions([]);
  }, []);

  return { suggestions, visible, generateSuggestions, dismiss };
}
