#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_REF="38d260123b9900421e41e7ffd63335133fcb1dc7"
REF="${1:-$DEFAULT_REF}"
FETCHED_AT="${2:-$(date +%F)}"
OUTPUT_PATH="$ROOT_DIR/docs/vendor/gemini/gemini-live-api-dev.SKILL.md"
RAW_URL="https://raw.githubusercontent.com/google-gemini/gemini-skills/$REF/skills/gemini-live-api-dev/SKILL.md"
SOURCE_URL="https://github.com/google-gemini/gemini-skills/blob/$REF/skills/gemini-live-api-dev/SKILL.md"

mkdir -p "$(dirname "$OUTPUT_PATH")"

TMP_FILE="$(mktemp)"
cleanup() {
  rm -f "$TMP_FILE"
}
trap cleanup EXIT

curl --fail --silent --show-error --location "$RAW_URL" > "$TMP_FILE"

cat > "$OUTPUT_PATH" <<EOF_HEADER
---
name: gemini-live-api-dev
description: Use this skill when building real-time, bidirectional streaming applications with the Gemini Live API. Covers WebSocket-based audio/video/text streaming, voice activity detection (VAD), native audio features, function calling, session management, ephemeral tokens for client-side auth, and all Live API configuration options. SDKs covered - google-genai (Python), @google/genai (JavaScript/TypeScript).
---

<!--
Vendored from google-gemini/gemini-skills for Gemini Live migration reference.
Original source: $SOURCE_URL
Pinned ref: $REF
Fetched: $FETCHED_AT
Refresh intentionally during Gemini migration work; verify time-sensitive details against https://ai.google.dev/gemini-api/docs/coding-agents and linked Live API docs.
-->

EOF_HEADER

sed '1,/^---$/d' "$TMP_FILE" >> "$OUTPUT_PATH"

printf 'Synced %s from %s\n' "$OUTPUT_PATH" "$REF"
