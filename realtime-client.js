// MyPitchGym - Realtime WebRTC Client (GA API)
// Persistent WebRTC connection to OpenAI Realtime API.
// One connection per roleplay session. Audio streams both directions.
// Server-side VAD handles turn detection and interruption.

const RealtimeClient = {
  pc: null,
  dc: null,
  audioEl: null,
  audioContext: null,
  analyser: null,
  source: null,
  localStream: null,
  callActive: false,
  transcript: [],

  // Timing
  timing: {
    userTurnEnd: null,
    firstAudioTime: null,
    interruptionStart: null,
    interruptionEnd: null
  },

  // Callbacks - set by caller
  onAIStartSpeaking: null,
  onAIStopSpeaking: null,
  onUserText: null,
  onAIText: null,
  onTranscriptUpdate: null,
  onError: null,
  onConnected: null,
  onStatusChange: null,

  // Live session state
  _aiSpeaking: false,
  _userSpeaking: false,
  _currentResponseId: null,
  _currentAssistantItemId: null,
  _activeUserItemId: null,
  _activeUserStartedBeforeEnd: false,
  _ending: false,

  // Transcript collector state
  _items: null,
  _itemSequence: 0,
  _responses: null,
  _internalUserTextQueue: null,
  _lastTranscriptSignature: "",

  resetTranscriptCollector() {
    this.transcript = [];
    this._items = new Map();
    this._itemSequence = 0;
    this._responses = new Map();
    this._internalUserTextQueue = [];
    this._lastTranscriptSignature = "";
    this._currentResponseId = null;
    this._currentAssistantItemId = null;
    this._activeUserItemId = null;
    this._activeUserStartedBeforeEnd = false;
    this._ending = false;
  },

  async connect(config) {
    this.resetTranscriptCollector();
    this.localStream = config.localStream;
    this.callActive = true;
    this._aiSpeaking = false;
    this._userSpeaking = false;

    // Check browser support
    if (!window.RTCPeerConnection) {
      if (this.onError) this.onError("Your browser does not support WebRTC. Please use Chrome, Edge, or Firefox.");
      return;
    }

    try {
      this._setStatus("Connecting");

      // Create WebRTC peer connection
      this.pc = new RTCPeerConnection();

      // Set up audio element for AI audio output
      this.audioEl = document.createElement("audio");
      this.audioEl.autoplay = true;
      this.audioEl.playsInline = true;
      document.body.appendChild(this.audioEl);

      // Handle incoming audio track from OpenAI
      this.pc.ontrack = (e) => {
        this.audioEl.srcObject = e.streams[0];
        this.setupAudioAnalyser(this.audioEl);
      };

      // Add local microphone track
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        this.pc.addTrack(audioTracks[0], this.localStream);
      }

      // Create data channel for events
      this.dc = this.pc.createDataChannel("oai-events");
      this.setupDataChannel();

      // Peer connection state monitoring
      this.pc.onconnectionstatechange = () => {
        const state = this.pc ? this.pc.connectionState : "closed";
        this._devLog("Peer connection state", { state });

        switch (state) {
          case "connecting":
            this._setStatus("Connecting");
            break;
          case "connected":
            this._setStatus("Connected");
            break;
          case "disconnected":
            if (this.callActive) {
              this._setStatus("Connection lost");
              if (this.onError) this.onError("Connection lost. Try ending and restarting the call.");
            }
            break;
          case "failed":
            this._setStatus("Connection failed");
            if (this.onError) this.onError("WebRTC connection failed.");
            break;
          case "closed":
            this._setStatus("Session ended");
            break;
        }
      };

      // Create SDP offer
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      // Wait for ICE gathering
      await this.waitForIceGathering();

      // Send SDP offer to our server, which proxies to OpenAI /v1/realtime/calls
      this._setStatus("Connecting to AI");

      const response = await fetch("/api/realtime-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdp: this.pc.localDescription.sdp,
          session: config.sessionConfig
        })
      });

      if (!response.ok) {
        let message = "Server connection failed";
        try {
          const err = await response.json();
          message = err.error || message;
        } catch (e) {}
        throw new Error(message);
      }

      const { sdp: answerSdp } = await response.json();

      if (!answerSdp || !answerSdp.trim()) {
        throw new Error("Server returned empty SDP answer");
      }

      await this.pc.setRemoteDescription({ type: "answer", sdp: answerSdp });

      // Connection is being established.
      // onConnected will fire when data channel opens.

    } catch (err) {
      console.error("[Realtime] Connect error:", err.message);
      if (this.onError) this.onError(err.message);
      this.disconnect();
    }
  },

  setupDataChannel() {
    this.dc.onopen = () => {
      this._devLog("Data channel opened");
      if (this.onConnected) this.onConnected();
    };

    this.dc.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.handleEvent(data);
      } catch (e) {
        console.warn("[Realtime] Malformed data channel message:", e.message);
      }
    };

    this.dc.onerror = (err) => {
      console.error("[Realtime] Data channel error:", err);
      if (this.onError) this.onError("Data channel error");
    };

    this.dc.onclose = () => {
      this._devLog("Data channel closed");
      if (this.callActive) {
        if (this.onError) this.onError("Connection closed unexpectedly");
      }
    };
  },

  handleEvent(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      // === User speech detection (semantic VAD) ===
      case "input_audio_buffer.speech_started":
        this._handleSpeechStarted(data);
        break;

      case "input_audio_buffer.speech_stopped":
        this._handleSpeechStopped(data);
        break;

      case "input_audio_buffer.committed":
        this._handleInputCommitted(data);
        break;

      // === Conversation items and input transcription ===
      case "conversation.item.added":
      case "conversation.item.created":
        this._handleConversationItem(data, "added");
        break;

      case "conversation.item.done":
        this._handleConversationItem(data, "done");
        break;

      case "conversation.item.retrieved":
        this._handleConversationItem(data, "retrieved");
        break;

      case "conversation.item.truncated":
        this._handleConversationItemTruncated(data);
        break;

      case "conversation.item.input_audio_transcription.delta":
        this._handleUserTranscriptDelta(data);
        break;

      case "conversation.item.input_audio_transcription.completed":
        this._handleUserTranscriptCompleted(data);
        break;

      case "conversation.item.input_audio_transcription.failed":
        this._handleUserTranscriptFailed(data);
        break;

      // === AI response lifecycle ===
      case "response.created":
        this._handleResponseCreated(data);
        break;

      case "response.output_item.added":
        this._handleResponseOutputItem(data, "added");
        break;

      case "response.output_item.done":
        this._handleResponseOutputItem(data, "done");
        break;

      case "response.output_audio.delta":
        this._handleOutputAudioDelta(data);
        break;

      case "response.output_audio.done":
        this._handleOutputAudioDone(data);
        break;

      case "response.output_audio_transcript.delta":
        this._handleAssistantTranscriptDelta(data);
        break;

      case "response.output_audio_transcript.done":
        this._handleAssistantTranscriptDone(data);
        break;

      case "response.output_text.delta":
        this._handleAssistantTextDelta(data);
        break;

      case "response.output_text.done":
        this._handleAssistantTextDone(data);
        break;

      case "response.done":
        this._handleResponseDone(data);
        break;

      case "error":
        console.error("[Realtime] API error:", this._safeError(data.error));
        if (this.onError) this.onError(data.error ? data.error.message : "Realtime API error");
        break;

      case "conversation.created":
        this._diag(data, "conversation_created");
        break;

      default:
        this._devLog("Unhandled event", this._safeEventSummary(data));
        break;
    }
  },

  _handleSpeechStarted(data) {
    this._userSpeaking = true;
    this.timing.interruptionStart = Date.now();
    this._activeUserItemId = data.item_id || this._activeUserItemId;
    this._activeUserStartedBeforeEnd = !this._ending;

    const item = this._ensureItem(this._activeUserItemId, "user");
    if (item) {
      item.state = "speaking";
      item.startedBeforeEnd = !this._ending;
      if (this._ending) item.ignoreAfterEnd = true;
    }

    // If AI was speaking, this is an interruption.
    if (this._aiSpeaking) {
      this._devLog("User interrupted AI", {
        response_id: this._currentResponseId,
        item_id: this._currentAssistantItemId
      });
      this._aiSpeaking = false;
      if (this.onAIStopSpeaking) this.onAIStopSpeaking();
    }

    this._diag(data, "user_speech_started");
    this._setStatus("User speaking");
  },

  _handleSpeechStopped(data) {
    this._userSpeaking = false;
    this.timing.userTurnEnd = Date.now();

    const itemId = data.item_id || this._activeUserItemId;
    const item = this._ensureItem(itemId, "user");
    if (item) item.state = "speech_stopped";

    this._diag(data, "user_speech_stopped");
    this._setStatus(this._ending ? "Finalizing" : "Processing");
  },

  _handleInputCommitted(data) {
    const item = this._ensureItem(data.item_id || this._activeUserItemId, "user");
    if (item) {
      item.state = "committed";
      item.startedBeforeEnd = item.startedBeforeEnd || this._activeUserStartedBeforeEnd;
      this._setPreviousItem(item, data.previous_item_id);
      if (this._ending && !item.startedBeforeEnd && !item.finalText) item.ignoreAfterEnd = true;
    }
    this._activeUserItemId = null;
    this._activeUserStartedBeforeEnd = false;
    this._diag(data, "user_audio_committed");
  },

  _handleConversationItem(data, phase) {
    const item = this._registerOpenAIItem(data.item, data.previous_item_id);
    if (!item) return;

    if (phase === "done") {
      item.itemDone = true;
      item.state = item.state === "completed" ? item.state : "item_done";
      const text = this._extractItemTranscript(data.item);
      if (text) this._setFinalText(item, text, "conversation.item.done", 2);
    } else if (phase === "retrieved") {
      item.retrieveDone = true;
      const text = this._extractItemTranscript(data.item);
      if (text) this._setFinalText(item, text, "conversation.item.retrieved", 2);
    }

    this._diag(data, "conversation_item_" + phase, item);
    this._emitTranscriptUpdate();
  },

  _handleConversationItemTruncated(data) {
    const item = this._ensureItem(data.item_id, "assistant");
    if (item) {
      const response = item.responseId && this._responses ? this._responses.get(item.responseId) : null;
      const cancelledByEnd = this._ending || (response && response.cancelledByEnd);
      item.state = "truncated";
      item.truncated = true;
      if (cancelledByEnd) item.cancelledByEnd = true;
      if (cancelledByEnd && !item.emittedText) {
        item.finalText = "";
        item.finalSourceRank = 0;
      }
    }
    this._diag(data, "conversation_item_truncated", item);
    this._emitTranscriptUpdate();
  },

  _handleUserTranscriptDelta(data) {
    const item = this._ensureItem(data.item_id, "user");
    if (!item || item.ignoreAfterEnd) return;
    item.userPartialText = (item.userPartialText || "") + (data.delta || "");
    item.transcriptState = "streaming";
    this._diag(data, "user_transcript_delta", item);
  },

  _handleUserTranscriptCompleted(data) {
    const item = this._ensureItem(data.item_id, "user");
    if (!item || item.ignoreAfterEnd) return;
    item.transcriptState = "completed";
    this._setFinalText(item, data.transcript || "", "conversation.item.input_audio_transcription.completed", 3);
    this._diag(data, "user_transcript_completed", item);
    this._emitTranscriptUpdate();
  },

  _handleUserTranscriptFailed(data) {
    const item = this._ensureItem(data.item_id, "user");
    if (item) {
      item.transcriptState = "failed";
      item.state = "failed";
      item.failed = true;
      item.failureReason = data.error ? data.error.code || data.error.type || "transcription_failed" : "transcription_failed";
    }
    console.warn("[Realtime] Input transcription failed:", {
      item_id: data.item_id || null,
      code: data.error ? data.error.code || null : null,
      type: data.error ? data.error.type || null : null
    });
    this._diag(data, "user_transcript_failed", item);
    this._emitTranscriptUpdate();
  },

  _handleResponseCreated(data) {
    const response = data.response || {};
    const responseId = response.id || data.response_id || null;
    if (responseId) {
      const tracked = this._ensureResponse(responseId);
      tracked.status = response.status || "in_progress";
      tracked.done = false;
      this._currentResponseId = responseId;
    }
    this._diag(data, "response_created");
  },

  _handleResponseOutputItem(data, phase) {
    const item = this._registerOpenAIItem(data.item, null, {
      role: data.item && data.item.role ? data.item.role : "assistant",
      responseId: data.response_id,
      outputIndex: data.output_index
    });

    if (data.response_id) {
      const response = this._ensureResponse(data.response_id);
      if (item && !response.itemIds.includes(item.id)) response.itemIds.push(item.id);
    }

    if (item) {
      item.responseId = data.response_id || item.responseId;
      item.outputIndex = data.output_index !== undefined ? data.output_index : item.outputIndex;
      if (phase === "added") {
        item.state = "output_item_added";
        if (item.role === "assistant") this._currentAssistantItemId = item.id;
      } else {
        item.outputItemDone = true;
        item.state = item.state === "completed" ? item.state : "output_item_done";
        const text = this._extractItemTranscript(data.item);
        if (text) this._setFinalText(item, text, "response.output_item.done", 2);
      }
    }

    this._diag(data, "response_output_item_" + phase, item);
    this._emitTranscriptUpdate();
  },

  _handleOutputAudioDelta(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (item) {
      item.responseId = data.response_id || item.responseId;
      item.outputIndex = data.output_index !== undefined ? data.output_index : item.outputIndex;
      this._currentAssistantItemId = item.id;
    }

    if (data.response_id) this._currentResponseId = data.response_id;

    if (!this._aiSpeaking) {
      this._aiSpeaking = true;
      this.timing.firstAudioTime = Date.now();

      if (this.timing.userTurnEnd) {
        const latency = this.timing.firstAudioTime - this.timing.userTurnEnd;
        this._devLog("Latency", { user_turn_end_to_first_ai_audio_ms: latency });

        if (this.timing.interruptionStart) {
          const interruptDelay = this.timing.firstAudioTime - this.timing.interruptionStart;
          this._devLog("Interruption processing time", { ms: interruptDelay });
        }
      }

      this._setStatus("AI responding");
      if (this.onAIStartSpeaking) this.onAIStartSpeaking();
    }

    this._diag(data, "assistant_audio_delta", item);
  },

  _handleOutputAudioDone(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (item) item.audioDone = true;
    this._diag(data, "assistant_audio_done", item);
  },

  _handleAssistantTranscriptDelta(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (!item || item.cancelledByEnd) return;
    item.responseId = data.response_id || item.responseId;
    item.assistantPartialText = (item.assistantPartialText || "") + (data.delta || "");
    item.state = "transcript_streaming";
    item.transcriptState = "streaming";
    this._diag(data, "assistant_transcript_delta", item);
  },

  _handleAssistantTranscriptDone(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (!item) return;
    item.responseId = data.response_id || item.responseId;
    item.outputIndex = data.output_index !== undefined ? data.output_index : item.outputIndex;
    item.transcriptState = "completed";
    this._setFinalText(item, data.transcript || "", "response.output_audio_transcript.done", 3);
    this._diag(data, "assistant_transcript_done", item);
    this._emitTranscriptUpdate();
  },

  _handleAssistantTextDelta(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (!item || item.cancelledByEnd) return;
    item.assistantTextPartial = (item.assistantTextPartial || "") + (data.delta || "");
    item.state = "text_streaming";
    item.transcriptState = "text_streaming";
    this._diag(data, "assistant_text_delta", item);
  },

  _handleAssistantTextDone(data) {
    const item = this._ensureItem(data.item_id || this._currentAssistantItemId, "assistant");
    if (!item) return;
    item.transcriptState = "completed";
    this._setFinalText(item, data.text || "", "response.output_text.done", 3);
    this._diag(data, "assistant_text_done", item);
    this._emitTranscriptUpdate();
  },

  _handleResponseDone(data) {
    const response = data.response || {};
    const responseId = response.id || data.response_id || this._currentResponseId;
    const status = response.status || data.status || "completed";

    if (responseId) {
      const tracked = this._ensureResponse(responseId);
      tracked.status = status;
      tracked.done = true;
      tracked.statusDetails = response.status_details || null;

      if (tracked.cancelledByEnd || status === "failed") {
        for (const itemId of tracked.itemIds) {
          const item = this._items.get(itemId);
          if (!item) continue;
          if (tracked.cancelledByEnd) item.cancelledByEnd = true;
          if (status === "failed" && !item.finalText) item.failed = true;
          if (!item.finalText) item.state = tracked.cancelledByEnd ? "cancelled" : status;
        }
      }
    }

    this._aiSpeaking = false;
    if (responseId && this._currentResponseId === responseId) this._currentResponseId = null;
    this._currentAssistantItemId = null;

    if (this.onAIStopSpeaking) this.onAIStopSpeaking();
    if (!this._ending) this._setStatus("Listening");

    this._diag(data, "response_done");
    this._emitTranscriptUpdate();
  },

  async finalizeTranscript(options) {
    const timeoutMs = options && options.timeoutMs ? options.timeoutMs : 3500;
    const pollMs = options && options.pollMs ? options.pollMs : 80;
    const startedAt = Date.now();

    this._ending = true;
    this._setStatus("Finalizing");

    if (this._aiSpeaking || this._hasOpenResponses()) {
      this._cancelActiveResponseForEnd();
    }

    this._requestPendingItemRetrievals();

    return new Promise((resolve) => {
      const check = () => {
        this._requestPendingItemRetrievals();

        const pendingItems = this._getPendingTranscriptItems();
        const pendingResponses = this._getPendingResponseIds();
        const elapsed = Date.now() - startedAt;

        if ((pendingItems.length === 0 && pendingResponses.length === 0) || elapsed >= timeoutMs) {
          const timedOut = pendingItems.length > 0 || pendingResponses.length > 0;
          if (timedOut) {
            this._markTimedOut(pendingItems, pendingResponses);
          }

          this._emitTranscriptUpdate();
          resolve({
            transcript: this.transcript.slice(),
            timedOut,
            pendingItemCount: pendingItems.length,
            pendingResponseCount: pendingResponses.length
          });
          return;
        }

        setTimeout(check, pollMs);
      };

      check();
    });
  },

  _cancelActiveResponseForEnd() {
    if (!this.dc || this.dc.readyState !== "open") return;

    const responseId = this._currentResponseId || this._getFirstOpenResponseId();
    if (responseId) {
      const tracked = this._ensureResponse(responseId);
      tracked.cancelledByEnd = true;
      for (const itemId of tracked.itemIds) {
        const item = this._items.get(itemId);
        if (item && !item.finalText) {
          item.cancelledByEnd = true;
          item.state = "cancel_requested";
        }
      }
    }

    try {
      const event = { type: "response.cancel" };
      if (responseId) event.response_id = responseId;
      this.dc.send(JSON.stringify(event));
      this._devLog("Requested response cancel for end-call finalization", { response_id: responseId || null });
    } catch (e) {
      console.warn("[Realtime] Failed to cancel active response:", e.message);
    }
  },

  _requestPendingItemRetrievals() {
    if (!this.dc || this.dc.readyState !== "open") return;

    for (const item of this._getPendingTranscriptItems()) {
      if (!item.id || item.retrieveRequested || item.ignoreAfterEnd || item.cancelledByEnd) continue;
      try {
        item.retrieveRequested = true;
        this.dc.send(JSON.stringify({
          type: "conversation.item.retrieve",
          item_id: item.id
        }));
        this._diag({ type: "conversation.item.retrieve", item_id: item.id }, "item_retrieve_requested", item);
      } catch (e) {
        console.warn("[Realtime] Failed to retrieve conversation item:", e.message);
      }
    }
  },

  _getPendingTranscriptItems() {
    const pending = [];
    if (!this._items) return pending;

    for (const item of this._items.values()) {
      if (item.internal || item.ignoreAfterEnd || item.failed || item.timedOut) continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      if (item.role === "assistant" && item.cancelledByEnd) continue;

      if (this._cleanText(item.finalText)) {
        if (item.finalSourceRank >= 3 || item.transcriptState === "completed") continue;
        pending.push(item);
        continue;
      }

      if (item.role === "user") {
        if (["speaking", "speech_stopped", "committed"].includes(item.state)) pending.push(item);
      } else if (item.role === "assistant") {
        if (["output_item_added", "output_item_done", "transcript_streaming", "text_streaming", "item_done"].includes(item.state) || item.responseId) {
          pending.push(item);
        }
      }
    }

    return pending;
  },

  _getPendingResponseIds() {
    const pending = [];
    if (!this._responses) return pending;

    for (const response of this._responses.values()) {
      if (!response.done && response.status !== "failed" && response.status !== "completed" && response.status !== "cancelled" && response.status !== "incomplete" && !response.timedOut) {
        pending.push(response.id);
      }
    }

    return pending;
  },

  _markTimedOut(items, responseIds) {
    for (const item of items) {
      if (!this._cleanText(item.finalText)) {
        item.timedOut = true;
        item.state = "timed_out";
      }
    }

    for (const responseId of responseIds) {
      const response = this._responses.get(responseId);
      if (response) {
        response.timedOut = true;
        response.status = "timed_out";
      }
    }

    this._devLog("Transcript finalization timed out", {
      pending_items: items.map(item => item.id),
      pending_responses: responseIds
    });
  },

  _hasOpenResponses() {
    return this._getFirstOpenResponseId() !== null;
  },

  _getFirstOpenResponseId() {
    if (!this._responses) return null;
    for (const response of this._responses.values()) {
      if (!response.done && !response.timedOut) return response.id;
    }
    return null;
  },

  _ensureItem(id, role) {
    if (!id) return null;
    if (!this._items) this.resetTranscriptCollector();

    if (!this._items.has(id)) {
      this._items.set(id, {
        id,
        role: role || null,
        sequence: ++this._itemSequence,
        previousItemId: undefined,
        responseId: null,
        outputIndex: null,
        state: "created",
        transcriptState: "pending",
        finalText: "",
        finalSource: "",
        finalSourceRank: 0,
        emittedText: false,
        internal: false,
        failed: false,
        timedOut: false,
        cancelledByEnd: false,
        ignoreAfterEnd: false,
        startedBeforeEnd: false,
        retrieveRequested: false,
        retrieveDone: false,
        itemDone: false,
        outputItemDone: false
      });
    }

    const item = this._items.get(id);
    if (role && !item.role) item.role = role;
    return item;
  },

  _ensureResponse(id) {
    if (!this._responses) this.resetTranscriptCollector();

    if (!this._responses.has(id)) {
      this._responses.set(id, {
        id,
        status: "in_progress",
        done: false,
        itemIds: [],
        cancelledByEnd: false,
        timedOut: false,
        statusDetails: null
      });
    }

    return this._responses.get(id);
  },

  _registerOpenAIItem(openAIItem, previousItemId, defaults) {
    if (!openAIItem || !openAIItem.id) return null;
    const role = openAIItem.role || (defaults && defaults.role) || null;
    const item = this._ensureItem(openAIItem.id, role);

    this._setPreviousItem(item, previousItemId);

    if (defaults) {
      item.responseId = defaults.responseId || item.responseId;
      item.outputIndex = defaults.outputIndex !== undefined ? defaults.outputIndex : item.outputIndex;
    }

    if (openAIItem.status && openAIItem.status !== "in_progress") item.state = openAIItem.status;

    const text = this._extractItemTranscript(openAIItem);
    if (text && item.role === "user") this._maybeMarkInternalUserText(item, text);

    return item;
  },

  _setPreviousItem(item, previousItemId) {
    if (!item) return;
    if (previousItemId !== undefined) item.previousItemId = previousItemId || null;
  },

  _extractItemTranscript(openAIItem) {
    if (!openAIItem || !Array.isArray(openAIItem.content)) return "";
    const parts = [];

    for (const part of openAIItem.content) {
      const text = part.transcript || part.text || "";
      if (text && text.trim()) parts.push(text.trim());
    }

    return parts.join(" ").trim();
  },

  _setFinalText(item, text, source, rank) {
    if (!item) return false;
    const clean = this._cleanText(text);

    if (!clean) {
      if (!item.finalText) item.state = "completed_empty";
      return false;
    }

    if (item.role === "assistant" && item.cancelledByEnd && !item.finalText) {
      item.state = "cancelled";
      return false;
    }

    if (item.finalText) {
      if (item.finalSourceRank > rank) return false;
      if (item.finalSourceRank === rank && item.finalText.length > clean.length) return false;
    }

    item.finalText = clean;
    item.finalSource = source;
    item.finalSourceRank = rank;
    item.state = "completed";
    item.failed = false;
    item.timedOut = false;

    if (rank >= 3) this._emitCompletedText(item);
    return true;
  },

  _emitCompletedText(item) {
    if (!item || item.emittedText || item.internal || item.ignoreAfterEnd) return;
    if (!this._cleanText(item.finalText)) return;

    if (item.role === "user") {
      if (this.onUserText) this.onUserText(item.finalText);
    } else if (item.role === "assistant") {
      if (this.onAIText) this.onAIText(item.finalText);
    }

    item.emittedText = true;
  },

  _queueInternalUserText(text) {
    const clean = this._cleanText(text);
    if (!clean) return;
    if (!this._internalUserTextQueue) this._internalUserTextQueue = [];
    this._internalUserTextQueue.push(clean);
  },

  _maybeMarkInternalUserText(item, text) {
    if (!item || item.role !== "user" || !this._internalUserTextQueue || this._internalUserTextQueue.length === 0) return;
    const clean = this._cleanText(text);
    const nextInternal = this._internalUserTextQueue[0];

    if (clean === nextInternal) {
      item.internal = true;
      item.state = "internal";
      this._internalUserTextQueue.shift();
    }
  },

  _emitTranscriptUpdate() {
    const nextTranscript = this._buildTranscript();
    const signature = JSON.stringify(nextTranscript);
    if (signature === this._lastTranscriptSignature) return;

    this._lastTranscriptSignature = signature;
    this.transcript = nextTranscript;
    if (this.onTranscriptUpdate) this.onTranscriptUpdate(this.transcript);
  },

  _buildTranscript() {
    const ordered = this._getOrderedItems();
    const transcript = [];

    for (const item of ordered) {
      if (item.internal || item.ignoreAfterEnd || item.failed) continue;
      if (item.role !== "user" && item.role !== "assistant") continue;
      if (item.role === "assistant" && item.cancelledByEnd) continue;

      const content = this._cleanText(item.finalText);
      if (!content) continue;

      transcript.push({
        role: item.role,
        content
      });
    }

    return transcript;
  },

  _getOrderedItems() {
    if (!this._items) return [];
    const items = Array.from(this._items.values()).sort((a, b) => a.sequence - b.sequence);
    const byId = new Map(items.map(item => [item.id, item]));
    const children = new Map();
    const roots = [];

    for (const item of items) {
      if (item.previousItemId && byId.has(item.previousItemId)) {
        if (!children.has(item.previousItemId)) children.set(item.previousItemId, []);
        children.get(item.previousItemId).push(item);
      } else {
        roots.push(item);
      }
    }

    for (const list of children.values()) {
      list.sort((a, b) => a.sequence - b.sequence);
    }

    const ordered = [];
    const visited = new Set();

    const visit = (item) => {
      if (!item || visited.has(item.id)) return;
      visited.add(item.id);
      ordered.push(item);
      const itemChildren = children.get(item.id) || [];
      for (const child of itemChildren) visit(child);
    };

    for (const root of roots) visit(root);
    for (const item of items) visit(item);

    return ordered;
  },

  _cleanText(text) {
    return (text || "").replace(/\s+/g, " ").trim();
  },

  // === Avatar lip-sync support ===
  setupAudioAnalyser(audioEl) {
    try {
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (this.audioContext.state === "suspended") this.audioContext.resume();

      this.source = this.audioContext.createMediaElementSource(audioEl);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.7;
      this.source.connect(this.analyser);
      this.analyser.connect(this.audioContext.destination);
    } catch (e) {
      this.analyser = null;
    }
  },

  getAmplitude() {
    if (!this.analyser) return 0;
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    let sum = 0;
    const voiceBands = Math.min(data.length, 32);
    for (let i = 0; i < voiceBands; i++) sum += data[i];
    return Math.min(1, (sum / voiceBands / 255) * 1.8);
  },

  // === Helpers ===
  _setStatus(status) {
    this._devLog("Status", { status });
    if (this.onStatusChange) this.onStatusChange(status);
  },

  waitForIceGathering() {
    return new Promise((resolve) => {
      if (!this.pc) { resolve(); return; }
      if (this.pc.iceGatheringState === "complete") {
        resolve();
        return;
      }
      let attempts = 0;
      const checkState = () => {
        if (!this.pc) { resolve(); return; }
        if (this.pc.iceGatheringState === "complete" || attempts >= 30) {
          resolve();
        } else {
          attempts++;
          setTimeout(checkState, 200);
        }
      };
      checkState();
    });
  },

  // Send a text message to trigger AI response (used for initial prompt).
  // These internal seed prompts are not included in the user's call transcript.
  sendTextMessage(text, options) {
    if (!this.dc || this.dc.readyState !== "open") return;
    const opts = options || {};
    if (opts.record !== true) this._queueInternalUserText(text);

    this.dc.send(JSON.stringify({
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: text }]
      }
    }));
    this.dc.send(JSON.stringify({ type: "response.create" }));
  },

  // Force AI to take a turn
  triggerResponse() {
    if (!this.dc || this.dc.readyState !== "open") return;
    this.dc.send(JSON.stringify({ type: "response.create" }));
  },

  _diag(data, state, itemOverride) {
    if (!this._isDevDiagnosticsEnabled()) return;
    const item = itemOverride || (data && data.item_id ? this._items && this._items.get(data.item_id) : null);
    console.log("[Realtime][Transcript]", {
      event: data ? data.type : null,
      item_id: data ? data.item_id || (data.item && data.item.id) || (item && item.id) || null : null,
      response_id: data ? data.response_id || (data.response && data.response.id) || (item && item.responseId) || null : null,
      role: item ? item.role : data && data.item ? data.item.role || null : null,
      state: state || (item ? item.state : null),
      transcript_state: item ? item.transcriptState : null,
      completed: item ? item.state === "completed" : false,
      failed: item ? !!item.failed : false,
      timed_out: item ? !!item.timedOut : false,
      cancelled: item ? !!item.cancelledByEnd : false
    });
  },

  _devLog(message, data) {
    if (!this._isDevDiagnosticsEnabled()) return;
    if (data !== undefined) console.log("[Realtime] " + message + ":", data);
    else console.log("[Realtime] " + message);
  },

  _isDevDiagnosticsEnabled() {
    try {
      if (typeof window !== "undefined" && window.localStorage && window.localStorage.getItem("mpg_realtime_debug") === "true") return true;
    } catch (e) {}

    try {
      if (typeof window !== "undefined" && window.location) {
        const hostname = window.location.hostname;
        return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
      }
    } catch (e) {}

    return false;
  },

  _safeEventSummary(data) {
    return {
      type: data && data.type ? data.type : null,
      event_id: data && data.event_id ? data.event_id : null,
      item_id: data && data.item_id ? data.item_id : data && data.item ? data.item.id || null : null,
      response_id: data && data.response_id ? data.response_id : data && data.response ? data.response.id || null : null,
      role: data && data.item ? data.item.role || null : null
    };
  },

  _safeError(error) {
    if (!error) return null;
    return {
      type: error.type || null,
      code: error.code || null,
      param: error.param || null,
      message: error.message || "Realtime API error"
    };
  },

  // === Cleanup ===
  disconnect() {
    this.callActive = false;
    this._aiSpeaking = false;
    this._userSpeaking = false;

    if (this.dc) {
      try { this.dc.close(); } catch (e) {}
      this.dc = null;
    }
    if (this.pc) {
      try { this.pc.ontrack = null; } catch (e) {}
      try { this.pc.onconnectionstatechange = null; } catch (e) {}
      try { this.pc.close(); } catch (e) {}
      this.pc = null;
    }
    if (this.audioEl) {
      try { this.audioEl.srcObject = null; } catch (e) {}
      try { this.audioEl.pause(); } catch (e) {}
      try { this.audioEl.remove(); } catch (e) {}
      this.audioEl = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
      this.analyser = null;
    }
    if (this.audioContext) {
      try { this.audioContext.close(); } catch (e) {}
      this.audioContext = null;
    }

    this._setStatus("Session ended");
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = RealtimeClient;
}
