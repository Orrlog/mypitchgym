const assert = require("assert");
const RealtimeClient = require("../realtime-client");

const callbacks = [
  "onAIStartSpeaking",
  "onAIStopSpeaking",
  "onUserText",
  "onAIText",
  "onTranscriptUpdate",
  "onError",
  "onConnected",
  "onStatusChange"
];

function resetClient() {
  RealtimeClient.resetTranscriptCollector();
  RealtimeClient.dc = null;
  RealtimeClient.pc = null;
  RealtimeClient.callActive = false;
  RealtimeClient._aiSpeaking = false;
  RealtimeClient._userSpeaking = false;
  RealtimeClient._transcriptionConfiguredInSession = false;
  for (const callback of callbacks) RealtimeClient[callback] = null;
}

function fakeDataChannel() {
  const sent = [];
  RealtimeClient.dc = {
    readyState: "open",
    sent,
    send(payload) {
      sent.push(JSON.parse(payload));
    },
    close() {
      this.readyState = "closed";
    }
  };
  return sent;
}

function msgItem(id, role, text) {
  return {
    id,
    type: "message",
    role,
    content: text ? [{ type: role === "assistant" ? "output_audio" : "input_audio", transcript: text }] : []
  };
}

function event(data) {
  RealtimeClient.handleEvent(data);
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testUserCompletedTranscript() {
  resetClient();
  event({ type: "input_audio_buffer.speech_started", item_id: "u1" });
  event({ type: "input_audio_buffer.committed", item_id: "u1" });
  event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u1", transcript: "Hi there" });

  assert.deepStrictEqual(RealtimeClient.transcript, [{ role: "user", content: "Hi there" }]);
}

async function testAssistantCompletedTranscript() {
  resetClient();
  event({ type: "response.created", response: { id: "r1", status: "in_progress" } });
  event({ type: "response.output_item.added", response_id: "r1", output_index: 0, item: msgItem("a1", "assistant") });
  event({ type: "response.output_audio_transcript.done", response_id: "r1", item_id: "a1", output_index: 0, transcript: "Hello from the buyer" });
  event({ type: "response.done", response: { id: "r1", status: "completed" } });

  assert.deepStrictEqual(RealtimeClient.transcript, [{ role: "assistant", content: "Hello from the buyer" }]);
}

async function testDeltasAreNotAuthoritative() {
  resetClient();
  event({ type: "response.output_item.added", response_id: "r2", output_index: 0, item: msgItem("a2", "assistant") });
  event({ type: "response.output_audio_transcript.delta", response_id: "r2", item_id: "a2", delta: "Partial" });
  assert.deepStrictEqual(RealtimeClient.transcript, []);

  event({ type: "response.output_audio_transcript.done", response_id: "r2", item_id: "a2", transcript: "Final answer" });
  event({ type: "response.output_audio_transcript.delta", response_id: "r2", item_id: "a2", delta: " ignored" });

  assert.deepStrictEqual(RealtimeClient.transcript, [{ role: "assistant", content: "Final answer" }]);
}

async function testFallbackWaitsForOfficialTranscript() {
  resetClient();
  fakeDataChannel();
  event({ type: "response.created", response: { id: "r10", status: "in_progress" } });
  event({ type: "response.output_item.added", response_id: "r10", output_index: 0, item: msgItem("a10", "assistant") });
  event({ type: "response.output_item.done", response_id: "r10", output_index: 0, item: msgItem("a10", "assistant", "Fallback text") });
  event({ type: "response.done", response: { id: "r10", status: "completed" } });

  const resultPromise = RealtimeClient.finalizeTranscript({ timeoutMs: 120, pollMs: 10 });
  setTimeout(() => {
    event({ type: "response.output_audio_transcript.done", response_id: "r10", item_id: "a10", transcript: "Official text" });
  }, 20);

  const result = await resultPromise;
  assert.strictEqual(result.timedOut, false);
  assert.deepStrictEqual(result.transcript, [{ role: "assistant", content: "Official text" }]);
}

async function testNaturalInterruptionKeepsTranscript() {
  resetClient();
  event({ type: "response.created", response: { id: "r3", status: "in_progress" } });
  event({ type: "response.output_item.added", response_id: "r3", output_index: 0, item: msgItem("a3", "assistant") });
  event({ type: "response.output_audio.delta", response_id: "r3", item_id: "a3", delta: "audio" });
  event({ type: "conversation.item.truncated", item_id: "a3" });
  event({ type: "response.done", response: { id: "r3", status: "cancelled" } });
  event({ type: "response.output_audio_transcript.done", response_id: "r3", item_id: "a3", transcript: "The part the user heard" });

  assert.deepStrictEqual(RealtimeClient.transcript, [{ role: "assistant", content: "The part the user heard" }]);
}

async function testLateUserTranscriptBeforeTimeout() {
  resetClient();
  fakeDataChannel();
  event({ type: "input_audio_buffer.speech_started", item_id: "u4" });

  const resultPromise = RealtimeClient.finalizeTranscript({ timeoutMs: 200, pollMs: 10 });
  setTimeout(() => {
    event({ type: "input_audio_buffer.committed", item_id: "u4" });
    event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u4", transcript: "Late but valid" });
  }, 25);

  const result = await resultPromise;
  assert.strictEqual(result.timedOut, false);
  assert.deepStrictEqual(result.transcript, [{ role: "user", content: "Late but valid" }]);
}

async function testInputTranscriptionFailureIsExcluded() {
  resetClient();
  event({ type: "input_audio_buffer.speech_started", item_id: "u5" });
  event({ type: "input_audio_buffer.committed", item_id: "u5" });
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    event({ type: "conversation.item.input_audio_transcription.failed", item_id: "u5", error: { code: "audio_unintelligible" } });
  } finally {
    console.warn = originalWarn;
  }

  assert.deepStrictEqual(RealtimeClient.transcript, []);
}

async function testFinalizationTimeoutExcludesUnresolvedTurn() {
  resetClient();
  fakeDataChannel();
  event({ type: "input_audio_buffer.speech_started", item_id: "u6" });

  const result = await RealtimeClient.finalizeTranscript({ timeoutMs: 30, pollMs: 5 });

  assert.strictEqual(result.timedOut, true);
  assert.deepStrictEqual(result.transcript, []);
  assert.strictEqual(RealtimeClient._items.get("u6").state, "timed_out");
}

async function testEmptyCompletedTranscriptIsExcluded() {
  resetClient();
  event({ type: "input_audio_buffer.speech_started", item_id: "u7" });
  event({ type: "input_audio_buffer.committed", item_id: "u7" });
  event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u7", transcript: "   " });

  assert.deepStrictEqual(RealtimeClient.transcript, []);
}

async function testPreviousItemOrdering() {
  resetClient();
  event({ type: "conversation.item.created", item: msgItem("a8", "assistant"), previous_item_id: "u8" });
  event({ type: "response.output_audio_transcript.done", response_id: "r8", item_id: "a8", transcript: "Second turn" });
  event({ type: "conversation.item.created", item: msgItem("u8", "user"), previous_item_id: null });
  event({ type: "conversation.item.input_audio_transcription.completed", item_id: "u8", transcript: "First turn" });

  assert.deepStrictEqual(RealtimeClient.transcript, [
    { role: "user", content: "First turn" },
    { role: "assistant", content: "Second turn" }
  ]);
}

async function testEndWhileAiSpeakingCancelsAssistantItem() {
  resetClient();
  const sent = fakeDataChannel();
  event({ type: "response.created", response: { id: "r9", status: "in_progress" } });
  event({ type: "response.output_item.added", response_id: "r9", output_index: 0, item: msgItem("a9", "assistant") });
  event({ type: "response.output_audio.delta", response_id: "r9", item_id: "a9", delta: "audio" });

  const resultPromise = RealtimeClient.finalizeTranscript({ timeoutMs: 100, pollMs: 10 });
  setTimeout(() => {
    event({ type: "response.done", response: { id: "r9", status: "cancelled" } });
    event({ type: "response.output_audio_transcript.done", response_id: "r9", item_id: "a9", transcript: "Unheard tail" });
  }, 20);

  const result = await resultPromise;

  assert(sent.some(payload => payload.type === "response.cancel" && payload.response_id === "r9"));
  assert.strictEqual(result.timedOut, false);
  assert.deepStrictEqual(result.transcript, []);
}

const tests = [
  ["user completed transcript", testUserCompletedTranscript],
  ["assistant completed transcript", testAssistantCompletedTranscript],
  ["deltas are not authoritative", testDeltasAreNotAuthoritative],
  ["fallback waits for official transcript", testFallbackWaitsForOfficialTranscript],
  ["natural interruption keeps transcript", testNaturalInterruptionKeepsTranscript],
  ["late user transcript before timeout", testLateUserTranscriptBeforeTimeout],
  ["input transcription failure is excluded", testInputTranscriptionFailureIsExcluded],
  ["finalization timeout excludes unresolved turn", testFinalizationTimeoutExcludesUnresolvedTurn],
  ["empty completed transcript is excluded", testEmptyCompletedTranscriptIsExcluded],
  ["previous item ordering", testPreviousItemOrdering],
  ["end while AI speaking cancels assistant item", testEndWhileAiSpeakingCancelsAssistantItem]
];

(async () => {
  for (const [name, fn] of tests) {
    await fn();
    console.log("ok - " + name);
  }
})().catch(err => {
  console.error(err);
  process.exit(1);
});
