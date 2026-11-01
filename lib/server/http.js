export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function sendJson(res, status, body, headers = {}) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  Object.entries(headers).forEach(([name, value]) => res.setHeader(name, value));
  res.end(JSON.stringify(body));
}

export function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  let originUrl;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new HttpError(403, "Request origin is not allowed.");
  }
  const requestHost = req.headers["x-forwarded-host"] || req.headers.host;
  if (!requestHost || originUrl.host !== requestHost) {
    throw new HttpError(403, "Request origin is not allowed.");
  }
}

export function readJsonBody(req) {
  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.");
    }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
  return body;
}

export function handleApiError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, { error: error.message });
    return;
  }
  console.error("ExamDesk API request failed:", error);
  sendJson(res, 500, { error: "The request could not be completed. Check the Vercel server configuration and try again." });
}
