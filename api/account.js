import { authenticateAccount, createSessionCookie, clearSessionCookie, getAccount, getSessionAccountId, registerAccount } from "../lib/server/accounts.js";
import { handleApiError, HttpError, readJsonBody, requireSameOrigin, sendJson } from "../lib/server/http.js";

function publicAccount(account) {
  return account ? { id: account.id, name: account.name, email: account.email } : null;
}

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const accountId = getSessionAccountId(req);
      if (!accountId) return sendJson(res, 200, { account: null });
      const account = await getAccount(accountId);
      return sendJson(res, 200, { account: publicAccount(account) });
    }

    if (req.method === "DELETE") {
      requireSameOrigin(req);
      return sendJson(res, 200, { account: null }, { "Set-Cookie": clearSessionCookie() });
    }

    if (req.method !== "POST") {
      res.setHeader("Allow", "GET, POST, DELETE");
      throw new HttpError(405, "Method not allowed.");
    }
    requireSameOrigin(req);
    const body = readJsonBody(req);
    if (body.action === "register") {
      const account = await registerAccount(body);
      return sendJson(res, 201, { account: publicAccount(account) }, { "Set-Cookie": createSessionCookie(account.id) });
    }
    if (body.action === "login") {
      const account = await authenticateAccount(body);
      return sendJson(res, 200, { account: publicAccount(account) }, { "Set-Cookie": createSessionCookie(account.id) });
    }
    throw new HttpError(400, "Choose sign in or create account.");
  } catch (error) {
    handleApiError(res, error);
  }
}
