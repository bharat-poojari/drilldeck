import { handleApiError, HttpError } from "../lib/server/http.js";

export default async function handler(req, res) {
  try {
    throw new HttpError(410, "Online account history is no longer available. Completed test details remain saved in this browser.");
  } catch (error) {
    handleApiError(res, error);
  }
}
