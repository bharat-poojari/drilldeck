import { createHmac, randomBytes, scryptSync, timingSafeEqual, randomUUID } from "node:crypto";
import { readJsonFile, updateJsonFile } from "./github-json.js";
import { HttpError } from "./http.js";

const USERS_FILE = "accounts.json";
const EMPTY_USERS = { users: [], scores: [] };
const SESSION_COOKIE = "drilldeck_session";
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_BYTES = 64;
const DUMMY_PASSWORD_SALT = "ZXhhbWRlc2stbm9uLWV4aXN0ZW50LXVzZXI=";

function getSessionSecret() {
  const secret = process.env.EXAMDESK_SESSION_SECRET || process.env.drilldeck_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("EXAMDESK_SESSION_SECRET must contain at least 32 characters.");
  return secret;
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export function validateRegistration({ name, email, password }) {
  const displayName = typeof name === "string" ? name.trim() : "";
  const normalizedEmail = normalizeEmail(email);
  if (displayName.length < 1 || displayName.length > 60 || /[\u0000-\u001f\u007f]/.test(displayName)) {
    throw new HttpError(400, "Enter a name between 1 and 60 characters.");
  }
  if (normalizedEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new HttpError(400, "Enter a valid email address.");
  }
  if (typeof password !== "string" || password.length < 10 || password.length > 128) {
    throw new HttpError(400, "Password must be between 10 and 128 characters.");
  }
  return { name: displayName, email: normalizedEmail };
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, PASSWORD_BYTES).toString("base64");
}

function getUsersData(data) {
  if (!data || !Array.isArray(data.users)) throw new Error("GitHub account storage must contain a users array.");
  if (!Array.isArray(data.scores)) data.scores = [];
  return data;
}

function createSessionToken(accountId) {
  const payload = Buffer.from(JSON.stringify({
    sub: accountId,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS
  })).toString("base64url");
  const signature = createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function createSessionCookie(accountId) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${createSessionToken(accountId)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}`;
}

export function getSessionAccountId(req) {
  const cookies = String(req.headers.cookie || "").split(";").map(item => item.trim());
  const token = cookies.find(item => item.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", getSessionSecret()).update(payload).digest();
  let actual;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    return typeof data.sub === "string" && Number.isInteger(data.exp) && data.exp > Date.now() / 1000 ? data.sub : null;
  } catch {
    return null;
  }
}

export async function registerAccount(input) {
  const { name, email } = validateRegistration(input);
  const passwordSalt = randomBytes(16).toString("base64");
  const passwordHash = hashPassword(input.password, passwordSalt);
  let createdAccount;

  await updateJsonFile(USERS_FILE, EMPTY_USERS, data => {
    const usersData = getUsersData(data);
    if (usersData.users.some(user => user.email === email)) {
      throw new HttpError(409, "An account with this email already exists. Sign in instead.");
    }
    createdAccount = {
      id: randomUUID(),
      name,
      email,
      passwordSalt,
      passwordHash,
      createdAt: new Date().toISOString(),
      history: []
    };
    usersData.users.push(createdAccount);
    return usersData;
  });
  return createdAccount;
}

export async function authenticateAccount(input) {
  const email = normalizeEmail(input.email);
  const password = input.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== "string" || password.length > 128) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  const { data } = await readJsonFile(USERS_FILE, EMPTY_USERS);
  const usersData = getUsersData(data);
  const account = usersData.users.find(user => user.email === email);
  const salt = account && typeof account.passwordSalt === "string" ? account.passwordSalt : DUMMY_PASSWORD_SALT;
  const candidate = Buffer.from(hashPassword(password, salt), "base64");
  const stored = Buffer.from(account && typeof account.passwordHash === "string" ? account.passwordHash : "", "base64");
  if (!account || candidate.length !== stored.length || !timingSafeEqual(candidate, stored)) {
    throw new HttpError(401, "Email or password is incorrect.");
  }
  return account;
}

export async function getAccount(accountId) {
  const { data } = await readJsonFile(USERS_FILE, EMPTY_USERS);
  return getUsersData(data).users.find(user => user.id === accountId) || null;
}
