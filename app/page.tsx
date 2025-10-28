"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type StoryEffect = "heartbeat" | "creak" | "whisper" | "gust" | "chime";

type StorySegment = {
  id: string;
  text: string;
  duration: number; // milliseconds until the next segment
  effects?: StoryEffect[];
};

const STORY_SEGMENTS: StorySegment[] = [
  {
    id: "segment-1",
    text:
      "Lila missed the last train, the platform lights clicking in a broken rhythm that echoed across the empty tunnel.",
    duration: 7500,
    effects: ["heartbeat"]
  },
  {
    id: "segment-2",
    text:
      "In the station’s maintenance log, a single line pulsed on her phone: Midnight maintenance delayed—do not remain underground.",
    duration: 7000,
    effects: ["whisper"]
  },
  {
    id: "segment-3",
    text:
      "A gust sighed down the tracks, carrying the copper tang of rain and the faint scrape of nails against old rail ties.",
    duration: 8000,
    effects: ["gust"]
  },
  {
    id: "segment-4",
    text:
      "Over the loudspeaker, a voice she didn’t recognize repeated her name, each syllable melting into static and low pleading.",
    duration: 7500,
    effects: ["whisper", "heartbeat"]
  },
  {
    id: "segment-5",
    text:
      "The arrival board flickered to 00:00—Track Thirteen—while a silhouette stepped from the tunnel, dripping shadow instead of water.",
    duration: 8000,
    effects: ["creak"]
  },
  {
    id: "segment-6",
    text:
      "When Lila backed away, the tiles beneath her boots shivered and cracked, revealing the hollow thud of bones beneath.",
    duration: 7500,
    effects: ["heartbeat"]
  },
  {
    id: "segment-7",
    text:
      "The silhouette lifted a lantern that glowed with trapped moths, each wingbeat tolling like a funeral chime.",
    duration: 7500,
    effects: ["chime"]
  },
  {
    id: "segment-8",
    text:
      "As the phantom train roared past, empty windows filled with faces she knew: all the commuters who ever vanished between stops, all mouthing the same warning—You’re already aboard.",
    duration: 8200,
    effects: ["creak", "whisper"]
  }
];

const TOTAL_DURATION = STORY_SEGMENTS.reduce((sum, segment) => sum + segment.duration, 0);

type AmbientNodes = {
  oscillators: OscillatorNode[];
  tremolo?: OscillatorNode;
  noise?: AudioBufferSourceNode;
};

export default function Page() {
  const [visibleSegments, setVisibleSegments] = useState<string[]>([]);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "playing" | "finished">("idle");
  const [elapsed, setElapsed] = useState<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const ambientRef = useRef<AmbientNodes | null>(null);
  const scheduleTimeoutsRef = useRef<number[]>([]);
  const timerIntervalRef = useRef<number | null>(null);

  const clearSchedule = useCallback(() => {
    scheduleTimeoutsRef.current.forEach((handle) => window.clearTimeout(handle));
    scheduleTimeoutsRef.current = [];
    if (timerIntervalRef.current) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const stopAmbient = useCallback(() => {
    const nodes = ambientRef.current;
    if (!nodes) return;

    nodes.oscillators.forEach((osc) => {
      try {
        osc.stop();
      } catch (error) {
        // ignore nodes that are already stopped
      }
      osc.disconnect();
    });

    if (nodes.tremolo) {
      try {
        nodes.tremolo.stop();
      } catch (error) {
        // ignore
      }
      nodes.tremolo.disconnect();
    }

    if (nodes.noise) {
      try {
        nodes.noise.stop();
      } catch (error) {
        // ignore
      }
      nodes.noise.disconnect();
    }

    ambientRef.current = null;
  }, []);

  const teardownAudio = useCallback(async () => {
    stopAmbient();

    const masterGain = masterGainRef.current;
    if (masterGain) {
      masterGain.disconnect();
      masterGainRef.current = null;
    }

    const context = audioContextRef.current;
    if (context) {
      try {
        if (context.state !== "closed") {
          await context.close();
        }
      } catch (error) {
        // Fail silently if context cannot close
      }
      audioContextRef.current = null;
    }
  }, [stopAmbient]);

  const ensureAudioContext = useCallback(async () => {
    if (typeof window === "undefined") {
      throw new Error("AudioContext unavailable on the server");
    }

    if (!audioContextRef.current) {
      const audioConstructor =
        window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!audioConstructor) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      const context = new audioConstructor();
      const masterGain = context.createGain();
      masterGain.gain.setValueAtTime(0.6, context.currentTime);
      masterGain.connect(context.destination);
      audioContextRef.current = context;
      masterGainRef.current = masterGain;
    } else if (audioContextRef.current.state === "suspended") {
      await audioContextRef.current.resume();
    }

    return {
      context: audioContextRef.current!,
      master: masterGainRef.current!
    };
  }, []);

  const beginAmbientBed = useCallback((context: AudioContext, masterGain: GainNode) => {
    if (ambientRef.current) return;

    const oscillators: OscillatorNode[] = [];

    const bassOsc = context.createOscillator();
    bassOsc.type = "sawtooth";
    bassOsc.frequency.setValueAtTime(52, context.currentTime);
    const bassGain = context.createGain();
    bassGain.gain.setValueAtTime(0.15, context.currentTime);
    bassOsc.connect(bassGain);
    bassGain.connect(masterGain);
    bassOsc.start();
    oscillators.push(bassOsc);

    const highOsc = context.createOscillator();
    highOsc.type = "triangle";
    highOsc.frequency.setValueAtTime(420, context.currentTime);
    const highGain = context.createGain();
    highGain.gain.setValueAtTime(0.05, context.currentTime);
    highOsc.connect(highGain);
    highGain.connect(masterGain);
    highOsc.start();
    oscillators.push(highOsc);

    const tremolo = context.createOscillator();
    tremolo.type = "sine";
    tremolo.frequency.setValueAtTime(0.35, context.currentTime);
    const tremoloDepth = context.createGain();
    tremoloDepth.gain.setValueAtTime(0.12, context.currentTime);
    tremolo.connect(tremoloDepth);
    tremoloDepth.connect(bassGain.gain);
    tremolo.start();

    const noiseBuffer = context.createBuffer(1, context.sampleRate * 6, context.sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i += 1) {
      const fade = 1 - i / channelData.length;
      channelData[i] = (Math.random() * 2 - 1) * fade * 0.4;
    }
    const noise = context.createBufferSource();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    const noiseFilter = context.createBiquadFilter();
    noiseFilter.type = "lowpass";
    noiseFilter.frequency.setValueAtTime(480, context.currentTime);
    const noiseGain = context.createGain();
    noiseGain.gain.setValueAtTime(0.12, context.currentTime);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);
    noise.start();

    ambientRef.current = {
      oscillators,
      tremolo,
      noise
    };
  }, []);

  const playHeartbeat = useCallback((context: AudioContext, destination: GainNode) => {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.connect(destination);

    const osc = context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(52, context.currentTime);
    osc.connect(gain);

    const scheduleBeat = (offset: number) => {
      const start = context.currentTime + offset;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(0.7, start + 0.06);
      gain.gain.linearRampToValueAtTime(0.0001, start + 0.4);
    };

    scheduleBeat(0);
    scheduleBeat(0.48);

    osc.start(context.currentTime);
    osc.stop(context.currentTime + 1.4);
    osc.onended = () => {
      gain.disconnect();
    };
  }, []);

  const playCreak = useCallback((context: AudioContext, destination: GainNode) => {
    const osc = context.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(380, context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(45, context.currentTime + 2.2);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.45, context.currentTime + 0.4);
    gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + 2.2);

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(180, context.currentTime);
    filter.Q.setValueAtTime(6, context.currentTime);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    osc.start(context.currentTime);
    osc.stop(context.currentTime + 2.5);
    osc.onended = () => {
      gain.disconnect();
    };
  }, []);

  const playWhisper = useCallback((context: AudioContext, destination: GainNode) => {
    const buffer = context.createBuffer(1, context.sampleRate * 2.2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const progress = i / data.length;
      data[i] = (Math.random() * 2 - 1) * (1 - progress) * 0.5;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.setValueAtTime(1200, context.currentTime);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.25, context.currentTime + 0.2);
    gain.gain.linearRampToValueAtTime(0.08, context.currentTime + 0.8);
    gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + 2.2);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(context.currentTime);
    source.stop(context.currentTime + 2.4);
    source.onended = () => {
      gain.disconnect();
    };
  }, []);

  const playGust = useCallback((context: AudioContext, destination: GainNode) => {
    const buffer = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) {
      const progress = i / data.length;
      const curve = Math.sin(progress * Math.PI);
      data[i] = (Math.random() * 2 - 1) * curve * 0.45;
    }

    const source = context.createBufferSource();
    source.buffer = buffer;

    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(260, context.currentTime);
    filter.Q.setValueAtTime(1.2, context.currentTime);

    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, context.currentTime + 0.8);
    gain.gain.linearRampToValueAtTime(0.0001, context.currentTime + 3);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(destination);

    source.start(context.currentTime);
    source.stop(context.currentTime + 3.2);
    source.onended = () => {
      gain.disconnect();
    };
  }, []);

  const playChime = useCallback((context: AudioContext, destination: GainNode) => {
    const frequencies = [660, 880, 1320];
    const now = context.currentTime;

    frequencies.forEach((freq, index) => {
      const osc = context.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now);

      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      const attack = 0.08 + index * 0.03;
      const decay = 1.8 + index * 0.25;
      gain.gain.linearRampToValueAtTime(0.18, now + attack);
      gain.gain.linearRampToValueAtTime(0.0001, now + attack + decay);

      osc.connect(gain);
      gain.connect(destination);

      osc.start(now);
      osc.stop(now + attack + decay + 0.1);
      osc.onended = () => {
        gain.disconnect();
      };
    });
  }, []);

  const triggerEffects = useCallback(
    (effects: StoryEffect[] | undefined) => {
      if (!effects || effects.length === 0) return;
      const context = audioContextRef.current;
      const master = masterGainRef.current;
      if (!context || !master) return;

      effects.forEach((effect) => {
        switch (effect) {
          case "heartbeat":
            playHeartbeat(context, master);
            break;
          case "creak":
            playCreak(context, master);
            break;
          case "whisper":
            playWhisper(context, master);
            break;
          case "gust":
            playGust(context, master);
            break;
          case "chime":
            playChime(context, master);
            break;
          default:
            break;
        }
      });
    },
    [playChime, playCreak, playGust, playHeartbeat, playWhisper]
  );

  const startTimer = useCallback(() => {
    const startTime = performance.now();
    setElapsed(0);

    timerIntervalRef.current = window.setInterval(() => {
      const delta = performance.now() - startTime;
      setElapsed(Math.min(delta, TOTAL_DURATION));
    }, 120);
  }, []);

  const startExperience = useCallback(async () => {
    clearSchedule();

    setVisibleSegments([]);
    setActiveSegment(null);
    setStatus("playing");
    setElapsed(0);

    const { context, master } = await ensureAudioContext();
    beginAmbientBed(context, master);
    triggerEffects(STORY_SEGMENTS[0].effects);

    startTimer();
    setVisibleSegments([STORY_SEGMENTS[0].id]);
    setActiveSegment(STORY_SEGMENTS[0].id);

    STORY_SEGMENTS.forEach((segment, index) => {
      if (index === 0) return;
      const delay = STORY_SEGMENTS.slice(0, index).reduce((sum, item) => sum + item.duration, 0);
      const timeout = window.setTimeout(() => {
        setVisibleSegments((prev) => Array.from(new Set([...prev, segment.id])));
        setActiveSegment(segment.id);
        triggerEffects(segment.effects);
        if (index === STORY_SEGMENTS.length - 1) {
          const finalTimeout = window.setTimeout(() => {
            setStatus("finished");
            setActiveSegment(null);
            if (timerIntervalRef.current) {
              window.clearInterval(timerIntervalRef.current);
              timerIntervalRef.current = null;
            }
          }, segment.duration);
          scheduleTimeoutsRef.current.push(finalTimeout);
        }
      }, delay);
      scheduleTimeoutsRef.current.push(timeout);
    });
  }, [beginAmbientBed, clearSchedule, ensureAudioContext, startTimer, triggerEffects]);

  const stopExperience = useCallback(async () => {
    clearSchedule();
    setStatus("idle");
    setActiveSegment(null);
    setVisibleSegments([]);
    setElapsed(0);
    await teardownAudio();
  }, [clearSchedule, teardownAudio]);

  useEffect(() => {
    return () => {
      clearSchedule();
      void teardownAudio();
    };
  }, [clearSchedule, teardownAudio]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "playing":
        return "TRANSMISSION ACTIVE";
      case "finished":
        return "ECHO COMPLETE";
      default:
        return "IDLE";
    }
  }, [status]);

  const formatTime = useCallback((timeMs: number) => {
    const totalSeconds = Math.ceil(timeMs / 1000);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (totalSeconds % 60).toString().padStart(2, "0");
    return `${minutes}:${seconds}`;
  }, []);

  return (
    <main className="app-shell" aria-live="polite">
      <section className="app-header">
        <h1>Midnight Signals</h1>
        <p>
          A one-minute horror experience. Press start, listen to the ambience, and let the station reveal its
          passengers.
        </p>
      </section>

      <section className="story-container">
        <div className="status-indicator">
          <span
            className={`status-dot ${status === "idle" ? "idle" : status === "playing" ? "" : "alert"}`}
            aria-hidden
          />
          <span>{statusLabel}</span>
          <span className="timer">{formatTime(status === "playing" ? elapsed : status === "finished" ? TOTAL_DURATION : 0)}</span>
        </div>

        <div className="controls" role="group" aria-label="Story controls">
          <button className="control-button" onClick={startExperience} disabled={status === "playing"}>
            {status === "playing" ? "Story in Progress" : status === "finished" ? "Replay Transmission" : "Start Transmission"}
          </button>
          <button className="control-button secondary" onClick={stopExperience} disabled={status === "idle"}>
            {status === "playing" ? "Abort" : "Reset"}
          </button>
        </div>

        <div className="story-grid">
          {STORY_SEGMENTS.map((segment) => {
            const isVisible = visibleSegments.includes(segment.id);
            if (!isVisible) {
              return null;
            }
            const isActive = activeSegment === segment.id;
            return (
              <p key={segment.id} className={`story-line ${isActive ? "highlighted" : ""}`}>
                {segment.text}
              </p>
            );
          })}
        </div>

        <div className="ambient-indicator">
          <svg viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M4 12c0-1.74 1.38-3.15 3.1-3.24a2 2 0 0 1 1.77-1.77C9.96 5.39 11.26 4 13 4c1.75 0 3.15 1.39 3.24 3.1a2 2 0 0 1 1.77 1.76C19.61 9.96 21 11.26 21 13s-1.39 3.15-3.1 3.24a2 2 0 0 1-1.77 1.77C15.04 18.61 13.74 20 12 20s-3.15-1.39-3.24-3.1a2 2 0 0 1-1.77-1.77C5.39 15.04 4 13.74 4 12Z"
            />
          </svg>
          <p>
            Headphones recommended. Audio reacts to the story—listen for the drones, creaks, and whispers that guide
            each scene.
          </p>
        </div>
      </section>
    </main>
  );
}
