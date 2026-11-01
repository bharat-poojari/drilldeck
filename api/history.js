import { getAccount, getSessionAccountId } from "../lib/server/accounts.js";
import { handleApiError, HttpError, sendJson } from "../lib/server/http.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      throw new HttpError(405, "Method not allowed.");
    }
    const accountId = getSessionAccountId(req);
    if (!accountId) throw new HttpError(401, "Sign in to view your score history.");
    const account = await getAccount(accountId);
    if (!account) throw new HttpError(401, "Sign in again to view your score history.");
    sendJson(res, 200, { history: Array.isArray(account.history) ? account.history : [] });
  } catch (error) {
    handleApiError(res, error);
  }
}
