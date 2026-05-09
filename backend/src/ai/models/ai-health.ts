/**
 * AI runtime health monitor
 *
 * Provider-agnostic surface for "is the configured model running on GPU,
 * partial CPU offload, or 100% CPU?" Currently the only provider that
 * exposes this is Ollama (via `GET /api/ps`); remote providers don't
 * surface runtime placement, so the monitor is only instantiated for
 * Ollama. Logs transitions and keeps reminding when in a degraded state.
 * Throttled so it can be triggered freely from the status endpoint
 * without hammering the inference server.
 */

import type { AppLogger } from "@backend/shared/logging";
import type { HttpClient } from "@backend/shared/http";
import { HttpError } from "@backend/shared/http";

export type HealthPlacement = "gpu" | "partial" | "cpu" | "not-loaded" | "unknown";

export interface HealthState {
  placement: HealthPlacement;
  gpuFraction: number; // 0..1
  gpuPercent: number; // 0..100, rounded
  sizeBytes: number;
  sizeVramBytes: number;
  lastCheckedAt: number | null;
}

export interface AiHealthConfig {
  baseURL: string;
  model: string;
  throttleMs: number;
  gpuThreshold: number;
}

export interface AiHealthMonitor {
  probe: () => Promise<void>;
  getState: () => HealthState;
}

interface OllamaPsEntry {
  model?: string;
  name?: string;
  size?: number;
  size_vram?: number;
}

interface OllamaPsResponse {
  models?: OllamaPsEntry[];
}

const modelsMatch = (entryModel: string, target: string): boolean => {
  if (entryModel === target) return true;
  if (entryModel.startsWith(`${target}:`)) return true;
  if (target.startsWith(`${entryModel}:`)) return true;
  return false;
};

export const createAiHealthMonitor = (
  config: AiHealthConfig,
  httpClient: HttpClient,
  logger: AppLogger,
): AiHealthMonitor => {
  const { baseURL, model, throttleMs, gpuThreshold } = config;

  const state: HealthState = {
    placement: "unknown",
    gpuFraction: 0,
    gpuPercent: 0,
    sizeBytes: 0,
    sizeVramBytes: 0,
    lastCheckedAt: null,
  };

  const getState = (): HealthState => ({ ...state });

  const probe = async (): Promise<void> => {
    const now = Date.now();
    if (state.lastCheckedAt !== null && now - state.lastCheckedAt < throttleMs) {
      return;
    }

    let body: OllamaPsResponse;
    try {
      body = await httpClient.getJson<OllamaPsResponse>(
        `${baseURL}/api/ps`,
        { source: "OllamaHealth" },
      );
    } catch (error) {
      // Health probe failures are expected when Ollama isn't running locally —
      // log at debug and move on, never let a probe error bubble up.
      const message =
        error instanceof HttpError
          ? `${error.source} ${error.status === 0 ? "transport" : `HTTP ${error.status}`}`
          : error instanceof Error
          ? error.message
          : String(error);
      logger.debug("ollama.health probe error", { error: message });
      return;
    }

    const previousPlacement = state.placement;

    const entries = body.models ?? [];
    const entry = entries.find((m) => {
      const entryModel = m.model ?? m.name;
      return entryModel ? modelsMatch(entryModel, model) : false;
    });

    if (!entry) {
      state.placement = "not-loaded";
      state.gpuFraction = 0;
      state.gpuPercent = 0;
      state.sizeBytes = 0;
      state.sizeVramBytes = 0;
    } else {
      const size = entry.size ?? 0;
      const sizeVram = entry.size_vram ?? 0;
      const fraction = size > 0 ? sizeVram / size : 0;

      let placement: HealthPlacement;
      if (fraction >= gpuThreshold) {
        placement = "gpu";
      } else if (fraction > 0) {
        placement = "partial";
      } else {
        placement = "cpu";
      }

      state.placement = placement;
      state.gpuFraction = fraction;
      state.gpuPercent = Math.round(fraction * 100);
      state.sizeBytes = size;
      state.sizeVramBytes = sizeVram;
    }

    state.lastCheckedAt = Date.now();

    const changed = previousPlacement !== state.placement;
    const meta = {
      model,
      placement: state.placement,
      gpuPercent: state.gpuPercent,
      sizeMB: Math.round(state.sizeBytes / 1_048_576),
      sizeVramMB: Math.round(state.sizeVramBytes / 1_048_576),
    };

    if (state.placement === "cpu") {
      logger.warn("ollama running on CPU — inference will be slow", meta);
    } else if (state.placement === "partial") {
      logger.warn("ollama partial CPU offload — performance degraded", meta);
    } else if (state.placement === "gpu" && changed) {
      logger.info("ollama running on GPU", meta);
    } else if (state.placement === "not-loaded" && changed) {
      logger.debug("ollama model not currently loaded (will load on next call)", { model });
    }
  };

  return { probe, getState };
};
