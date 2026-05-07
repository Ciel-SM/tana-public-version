import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { embedText } from '../lib/mind-palace/embed';
import type { SearchResult } from '../lib/mind-palace/types';
import { getCredentialErrorMessage, normalizeApiKey } from '../lib/google-api-errors';

const MAX_THUMBNAIL_CACHE = 24;

interface UseMindPalaceSidebarOptions {
  apiKey: string | null;
  initialize?: () => Promise<void>;
}

interface UseMindPalaceSidebarResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  query: string;
  setQuery: (q: string) => void;
  results: SearchResult[];
  isSearching: boolean;
  thumbnailCache: Map<string, string>;
  loadThumbnail: (path: string) => Promise<string | null>;
}

export function useMindPalaceSidebar({
  apiKey,
  initialize,
}: UseMindPalaceSidebarOptions): UseMindPalaceSidebarResult {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const thumbnailCacheRef = useRef(new Map<string, string>());
  const [thumbnailCache, setThumbnailCache] = useState(new Map<string, string>());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen(prev => !prev), []);

  // Keyboard shortcut: Cmd+M
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'm') {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [toggle]);

  useEffect(() => {
    if (isOpen) {
      void initialize?.();
    }
  }, [initialize, isOpen]);

  // Debounced search
  useEffect(() => {
    const normalizedApiKey = normalizeApiKey(apiKey);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    debounceRef.current = setTimeout(async () => {
      try {
        await initialize?.();
        const tana = (window as any).tana;
        if (!tana?.mindPalace?.search || !normalizedApiKey) {
          // Fallback to keyword search
          const keywordResults = await tana?.mindPalace?.searchKeyword?.(query, 10);
          setResults(keywordResults || []);
          setIsSearching(false);
          return;
        }

        // Embed the query
        const ai = new GoogleGenAI({ apiKey: normalizedApiKey });
        const queryEmbedding = await embedText(ai, query.trim());
        const embeddingArray = Array.from(queryEmbedding);

        // Search via IPC
        const searchResults = await tana.mindPalace.search(embeddingArray, 10);
        setResults(searchResults || []);
      } catch (err) {
        const message = getCredentialErrorMessage(err, 'access to Mind Palace search embeddings');
        if (message) {
          console.warn(`[MindPalace] ${message}`);
        } else {
          console.error('[MindPalace] Search error:', err);
        }
        // Fallback to keyword
        try {
          const tana = (window as any).tana;
          const keywordResults = await tana?.mindPalace?.searchKeyword?.(query, 10);
          setResults(keywordResults || []);
        } catch {}
      } finally {
        setIsSearching(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, apiKey, initialize]);

  const loadThumbnail = useCallback(async (path: string): Promise<string | null> => {
    if (thumbnailCacheRef.current.has(path)) {
      return thumbnailCacheRef.current.get(path) || null;
    }

    await initialize?.();
    const tana = (window as any).tana;
    const base64 = await tana?.mindPalace?.loadImage?.(path);
    if (base64) {
      if (thumbnailCacheRef.current.size >= MAX_THUMBNAIL_CACHE) {
        const oldestPath = thumbnailCacheRef.current.keys().next().value;
        if (oldestPath) {
          thumbnailCacheRef.current.delete(oldestPath);
        }
      }
      thumbnailCacheRef.current.set(path, base64);
      setThumbnailCache(new Map(thumbnailCacheRef.current));
    }
    return base64 || null;
  }, [initialize]);

  return {
    isOpen,
    open,
    close,
    toggle,
    query,
    setQuery,
    results,
    isSearching,
    thumbnailCache,
    loadThumbnail,
  };
}
