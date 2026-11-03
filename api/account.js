import { handleApiError, HttpError } from "../lib/server/http.js";

export default async function handler(req, res) {
  try {
    throw new HttpError(410, "Individual accounts are no longer available. Chat and global scores do not require an account.");
  } catch (error) {
    handleApiError(res, error);
  }
}
