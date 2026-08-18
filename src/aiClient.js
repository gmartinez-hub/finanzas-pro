const TASK_TIMEOUTS = {
  extract_transactions: 55_000,
  categorize_transactions: 30_000,
  weekly_insight: 30_000,
  scan_investments: 55_000,
  analyze_stock: 55_000,
  compare_instruments: 55_000,
};

export class AIServiceError extends Error {
  constructor(message, { code = "AI_ERROR", retryable = false, requestId = null, status = 0 } = {}) {
    super(message);
    this.name = "AIServiceError";
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
    this.status = status;
  }
}

async function readPayload(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export async function runAITask(task, input, { signal, timeoutMs = TASK_TIMEOUTS[task] || 30_000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
  const abortFromParent = () => controller.abort(signal?.reason || "cancelled");
  if (signal) {
    if (signal.aborted) abortFromParent();
    else signal.addEventListener("abort", abortFromParent, { once: true });
  }

  try {
    const response = await fetch("/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task, input }),
      signal: controller.signal,
    });
    const payload = await readPayload(response);

    if (!response.ok) {
      const error = payload?.error || {};
      throw new AIServiceError(
        error.message || (response.status === 429 ? "La IA está recibiendo demasiadas solicitudes. Probá de nuevo en un momento." : "No se pudo completar el análisis con IA."),
        {
          code: error.code || `HTTP_${response.status}`,
          retryable: Boolean(error.retryable || response.status === 429 || response.status >= 500),
          requestId: payload?.requestId || null,
          status: response.status,
        },
      );
    }

    if (!payload || !("data" in payload)) {
      throw new AIServiceError("La IA devolvió una respuesta incompleta.", {
        code: "INVALID_AI_RESPONSE",
        requestId: payload?.requestId || null,
        status: response.status,
      });
    }

    return payload;
  } catch (error) {
    if (error instanceof AIServiceError) throw error;
    if (controller.signal.aborted) {
      throw new AIServiceError(
        signal?.aborted ? "Análisis cancelado." : "La IA tardó demasiado. Probá nuevamente.",
        { code: signal?.aborted ? "CANCELLED" : "TIMEOUT", retryable: !signal?.aborted },
      );
    }
    throw new AIServiceError("No se pudo conectar con la IA. Revisá tu conexión e intentá otra vez.", {
      code: "NETWORK_ERROR",
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromParent);
  }
}

export async function extractTransactionsFromImage({ imageBase64, mime, today }, options) {
  return runAITask("extract_transactions", { imageBase64, mime, today }, options);
}

export async function categorizeTransactions(items, options) {
  return runAITask("categorize_transactions", { items }, options);
}

export async function generateWeeklyInsight(metrics, options) {
  return runAITask("weekly_insight", { metrics }, options);
}

export async function scanInvestments({ profile, usdRate, date }, options) {
  return runAITask("scan_investments", { profile, usdRate, date }, options);
}

export async function analyzeInvestment({ ticker, name, date }, options) {
  return runAITask("analyze_stock", { ticker, name, date }, options);
}

export async function compareInvestmentInstruments({ monthly, months, usdRate, date }, options) {
  return runAITask("compare_instruments", { monthly, months, usdRate, date }, options);
}
