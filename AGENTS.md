# MyPitchGym Agent Instructions

This is an existing working application. Inspect the current code before changing it.

## Safety Rules

- Do not work directly on `main` for development changes.
- Make small, reviewable changes and test the affected behavior.
- Report every changed file.
- Clearly state anything not tested.
- Do not rewrite the architecture unless the product owner approves it.
- Do not delete working, fallback, or legacy code without approval.

## Realtime Voice System

Preserve the current low-latency Realtime WebRTC architecture:

- Browser WebRTC peer connection
- `/api/realtime-session`
- OpenAI `/v1/realtime/calls`
- Persistent session per roleplay
- Data channel `oai-events`
- Semantic VAD
- Natural interruption
- Existing roleplay and Role Reversal behavior
- Existing voices, avatar behavior, prompts, and session settings

Do not switch back to the old record-upload-transcribe-chat-TTS pipeline.

Before changing model, voice, VAD, prompt behavior, Realtime endpoint, avatar behavior, Roleplay, Role Reversal, or session config, explain the reason, risk, and affected files, then wait for approval.

## Secrets And Access

- Keep secrets server-side.
- Never put secret values in client JavaScript.
- Never print, commit, request, or paste secret values in chat.
- Use placeholder environment-variable names in docs.
- Subscription and usage checks must be enforced server-side, not trusted to browser localStorage.

## Product Owner Communication

The product owner is not an experienced programmer.

Use complete, self-contained instructions when action is needed. Explain what is working, what is broken, what was verified, what was not verified, and what should happen next.
