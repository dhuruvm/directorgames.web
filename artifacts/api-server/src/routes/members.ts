import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  Router,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import {
  and,
  desc,
  eq,
} from "drizzle-orm";
import {
  directorBroadcasts,
  directorMailConnections,
  directorMembers,
} from "@workspace/db/schema";
import { isMemberRole, isMemberTitle } from "@workspace/api-zod";
import { logger } from "../lib/logger";

const router = Router();
const adminCookieName = "director_admin";
const oauthStateCookieName = "director_gmail_state";
const oauthFlowCookieName = "director_oauth_flow";
const mailConnectionId = "primary";
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const signupAttempts = new Map<string, { count: number; resetAt: number }>();
const memberFields = [
  "fullName",
  "email",
  "role",
  "title",
  "city",
] as const;
type MemberField = (typeof memberFields)[number];
type MemberInput = Record<MemberField, string>;

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

function cookieOptions(maxAge: number, sameSite = "None") {
  const secure = process.env["NODE_ENV"] === "production";
  return [
    "Path=/",
    "HttpOnly",
    `SameSite=${secure ? sameSite : "Lax"}`,
    ...(secure ? ["Secure"] : []),
    `Max-Age=${maxAge}`,
  ].join("; ");
}

function setCookie(response: Response, name: string, value: string, maxAge: number) {
  response.append("Set-Cookie", `${name}=${encodeURIComponent(value)}; ${cookieOptions(maxAge)}`);
}

function clearCookie(response: Response, name: string) {
  response.append("Set-Cookie", `${name}=; ${cookieOptions(0)}`);
}

function getSessionSecret() {
  const secret = readGoogleConfigFile().director["session_secret"];
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("director.session_secret must contain at least 32 characters in the Google OAuth JSON file.");
  }
  return secret;
}

function isSessionSigningConfigured() {
  try {
    getSessionSecret();
    return true;
  } catch (error) {
    logger.warn({ err: error }, "Admin session signing is not configured");
    return false;
  }
}

function makeAdminCookie(expiresAt: number) {
  const payload = `admin:${expiresAt}`;
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${signature}`;
}

function isAdmin(request: Request) {
  const value = readCookie(request, adminCookieName);
  if (!value) return false;
  const [role, expiry, signature, extra] = value.split(/[.:]/);
  if (role !== "admin" || !expiry || !signature || extra) return false;
  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  const expected = createHmac("sha256", getSessionSecret())
    .update(`${role}:${expiry}`)
    .digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(signature, "base64url");
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function requireAdmin(request: Request, response: Response) {
  try {
    if (isAdmin(request)) return true;
  } catch (error) {
    logger.error({ err: error }, "Admin session validation is not configured");
    response.status(503).json({ error: "Admin sign-in is not configured on the API." });
    return false;
  }
  response.status(401).json({ error: "Sign in to manage members." });
  return false;
}

function requireTrustedOrigin(
  request: Request,
  response: Response,
  next: NextFunction,
) {
  const origin = request.get("origin");
  const allowedOrigins = (process.env["FRONTEND_ORIGINS"] ?? "")
    .split(",")
    .map((value) => value.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  if (!origin || !allowedOrigins.includes(origin.replace(/\/+$/, ""))) {
    response.status(403).json({ error: "This request did not come from the configured studio website." });
    return;
  }
  next();
}

async function getDatabase() {
  if (!process.env["DATABASE_URL"]) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const { db } = await import("@workspace/db");
  return db;
}

function getErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  return typeof error.code === "string" ? error.code : undefined;
}

function getErrorConstraint(error: unknown) {
  if (typeof error !== "object" || error === null || !("constraint" in error)) {
    return undefined;
  }
  return typeof error.constraint === "string" ? error.constraint : undefined;
}

function consumeLimit(
  bucket: Map<string, { count: number; resetAt: number }>,
  key: string,
  maxAttempts: number,
  intervalMs: number,
) {
  const now = Date.now();
  const previous = bucket.get(key);
  if (previous && previous.resetAt > now && previous.count >= maxAttempts) {
    return Math.ceil((previous.resetAt - now) / 1000);
  }
  if (previous && previous.resetAt <= now) bucket.delete(key);
  const current = bucket.get(key);
  bucket.set(key, {
    count: current ? current.count + 1 : 1,
    resetAt: current?.resetAt ?? now + intervalMs,
  });
  if (bucket.size > 10000) {
    for (const [entryKey, entry] of bucket) {
      if (entry.resetAt <= now) bucket.delete(entryKey);
    }
  }
  return 0;
}

function handleRouteError(response: Response, error: unknown, operation: string) {
  if (error instanceof Error && error.message.includes("DATABASE_URL")) {
    logger.error({ err: error }, operation);
    response.status(503).json({ error: "Member storage is not configured on the API." });
    return;
  }
  logger.error({ err: error }, operation);
  response.status(500).json({ error: "The request could not be completed." });
}

function trimString(value: unknown, maxLength = 180) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function hasValidMemberOptions(body: unknown) {
  if (typeof body !== "object" || body === null) return true;
  const record = body as Record<string, unknown>;
  const role = trimString(record["role"], 300) || "Member";
  const title = trimString(record["title"], 300) || "Creative Operator";
  return isMemberRole(role) && isMemberTitle(title);
}

function readMemberInput(body: unknown, allowLegacyOptions = false): MemberInput | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const record = body as Record<string, unknown>;
  const input = Object.fromEntries(
    memberFields.map((field) => [
      field,
      trimString(record[field], 300) ||
        (field === "role" ? "Member" : field === "title" ? "Creative Operator" : field === "city" ? "Anywhere" : ""),
    ]),
  ) as MemberInput;
  if (
    !input.fullName ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) ||
    !input.role ||
    !input.title ||
    !input.city ||
    (!allowLegacyOptions && (!isMemberRole(input.role) || !isMemberTitle(input.title)))
  ) {
    return undefined;
  }
  input.email = input.email.toLowerCase();
  return input;
}

function makeMemberId() {
  return `DG-${String(randomInt(100000, 1000000))}`;
}

function expiryForTwoYears(issuedAt = new Date()) {
  const expiresAt = new Date(issuedAt);
  expiresAt.setFullYear(expiresAt.getFullYear() + 2);
  return { issuedAt, expiresAt };
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function welcomeMessage(member: typeof directorMembers.$inferSelect) {
  return `Dear ${member.fullName},\n\nYour application to The Director Games has been approved. Your studio membership card is now active.\n\nRole: ${member.role}\nTitle: ${member.title}\nMember ID: ${member.memberId}\nApproved: ${member.approvedAt ? formatDate(member.approvedAt) : formatDate(member.issuedAt)}\nValid until: ${new Date(member.expiresAt).getFullYear()}\n\nWe will keep the door open.\nThe Director Games\nThe Director`;
}

function encryptionKey() {
  const value = process.env["GMAIL_TOKEN_ENCRYPTION_KEY"];
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error("GMAIL_TOKEN_ENCRYPTION_KEY must be a 64-character hex value.");
  }
  return Buffer.from(value, "hex");
}

function encryptToken(token: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
}

function decryptToken(value: string) {
  const [ivValue, tagValue, encryptedValue] = value.split(".");
  if (!ivValue || !tagValue || !encryptedValue) {
    throw new Error("The stored Gmail refresh token is invalid.");
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function readGoogleConfigFile() {
  const configPaths = [
    path.resolve(process.cwd(), "artifacts/api-server/google-oauth-credentials.json"),
    path.resolve(process.cwd(), "google-oauth-credentials.json"),
  ];
  const configPath = configPaths.find((candidate) => existsSync(candidate));
  if (!configPath) {
    throw new Error(
      "Google OAuth JSON is missing. Place google-oauth-credentials.json in artifacts/api-server.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
  } catch (error) {
    throw new Error("Google OAuth JSON could not be read.", { cause: error });
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Google OAuth JSON must contain web and director objects.");
  }
  const record = parsed as Record<string, unknown>;
  const web = record["web"];
  const director = record["director"];
  if (
    typeof web !== "object" ||
    web === null ||
    typeof director !== "object" ||
    director === null
  ) {
    throw new Error("Google OAuth JSON must contain both web and director objects.");
  }
  return {
    web: web as Record<string, unknown>,
    director: director as Record<string, unknown>,
  };
}

function requireGoogleConfig() {
  const { web, director } = readGoogleConfigFile();
  const clientId = typeof web["client_id"] === "string" ? web["client_id"] : "";
  const clientSecret = typeof web["client_secret"] === "string" ? web["client_secret"] : "";
  const redirectUri = typeof director["redirect_uri"] === "string" ? director["redirect_uri"].trim() : "";
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Google OAuth JSON must include web.client_id, web.client_secret, and director.redirect_uri.",
    );
  }
  return { clientId, clientSecret, redirectUri, director };
}

function isGoogleAdminSignInConfigured() {
  try {
    const { director } = requireGoogleConfig();
    const email = typeof director["admin_email"] === "string"
      ? director["admin_email"].trim()
      : "";
    const sessionSecret = typeof director["session_secret"] === "string"
      ? director["session_secret"]
      : "";
    const frontendUrl = typeof director["frontend_url"] === "string"
      ? director["frontend_url"].trim()
      : "";
    return Boolean(
      sessionSecret.length >= 32 &&
      frontendUrl &&
      email &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    );
  } catch (error) {
    logger.warn({ err: error }, "Google Director sign-in is not configured");
    return false;
  }
}

function frontendUrl() {
  const { director } = readGoogleConfigFile();
  const configuredUrl = typeof director["frontend_url"] === "string"
    ? director["frontend_url"].trim()
    : "";
  const value = configuredUrl;
  if (!value) throw new Error("director.frontend_url is not configured in the Google OAuth JSON file.");
  return value.replace(/\/+$/, "");
}

async function loadMailConnection() {
  const db = await getDatabase();
  const [connection] = await db
    .select()
    .from(directorMailConnections)
    .where(eq(directorMailConnections.id, mailConnectionId))
    .limit(1);
  return connection;
}

async function getAccessToken() {
  const connection = await loadMailConnection();
  if (!connection) throw new Error("Connect a Google Workspace account before sending email.");
  const { clientId, clientSecret } = requireGoogleConfig();
  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  const result = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const responseBody = (await result.json()) as {
    access_token?: string;
    error_description?: string;
  };
  if (!result.ok || !responseBody.access_token) {
    throw new Error(
      responseBody.error_description ?? "Google could not refresh the Gmail connection.",
    );
  }
  return { accessToken: responseBody.access_token, sender: connection.email };
}

function encodeSubject(subject: string) {
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

async function sendMailWithAccessToken(
  to: string,
  subject: string,
  body: string,
  accessToken: string,
  sender: string,
) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    throw new Error("A member has an invalid email address.");
  }
  if (!subject.trim() || /[\r\n]/.test(subject)) {
    throw new Error("Email subject is invalid.");
  }
  const mimeMessage = [
    `From: The Director Games <${sender}>`,
    `To: ${to}`,
    `Subject: ${encodeSubject(subject)}`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: 8bit",
    "",
    body,
  ].join("\r\n");
  const result = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: Buffer.from(mimeMessage, "utf8").toString("base64url") }),
    },
  );
  if (!result.ok) {
    const errorBody = (await result.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(errorBody.error?.message ?? `Gmail rejected the message (${result.status}).`);
  }
}

async function sendMail(to: string, subject: string, body: string) {
  const { accessToken, sender } = await getAccessToken();
  await sendMailWithAccessToken(to, subject, body, accessToken, sender);
}

router.get("/admin/status", async (request, response) => {
  let authenticated = false;
  try {
    authenticated = isAdmin(request);
  } catch (error) {
    logger.error({ err: error }, "Admin session status is not configured");
    response.status(503).json({
      error: "Configure director.session_secret in the private Google OAuth JSON file before signing in.",
    });
    return;
  }
  if (!authenticated) {
    response.json({
      authenticated: false,
        adminConfigured: Boolean(process.env["ADMIN_PASSWORD"] && isSessionSigningConfigured()),
      googleSignInConfigured: isGoogleAdminSignInConfigured(),
      gmailConnected: false,
    });
    return;
  }
  try {
    const connection = await loadMailConnection();
    response.json({
      authenticated: true,
      adminConfigured: Boolean(process.env["ADMIN_PASSWORD"] && isSessionSigningConfigured()),
      googleSignInConfigured: isGoogleAdminSignInConfigured(),
      gmailConnected: Boolean(connection),
      gmailAddress: connection?.email ?? null,
    });
  } catch (error) {
    handleRouteError(response, error, "Could not load admin status");
  }
});

router.post("/admin/login", requireTrustedOrigin, (request, response) => {
  const configuredPassword = process.env["ADMIN_PASSWORD"];
  if (!configuredPassword || !isSessionSigningConfigured()) {
    response.status(503).json({ error: "Admin sign-in is not configured on the API." });
    return;
  }
  const clientKey = request.ip || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  const previousFailures = loginFailures.get(clientKey);
  if (previousFailures && previousFailures.resetAt > now && previousFailures.count >= 8) {
    response.setHeader("Retry-After", String(Math.ceil((previousFailures.resetAt - now) / 1000)));
    response.status(429).json({ error: "Too many sign-in attempts. Try again later." });
    return;
  }
  if (previousFailures && previousFailures.resetAt <= now) {
    loginFailures.delete(clientKey);
  }
  const submittedValue =
    typeof request.body === "object" && request.body !== null
      ? (request.body as Record<string, unknown>).password
      : undefined;
  const submittedPassword =
    typeof submittedValue === "string" ? submittedValue.slice(0, 1024) : "";
  const submittedHash = createHmac("sha256", "director-admin-password")
    .update(submittedPassword)
    .digest();
  const expectedHash = createHmac("sha256", "director-admin-password")
    .update(configuredPassword)
    .digest();
  if (!timingSafeEqual(submittedHash, expectedHash)) {
    const current = loginFailures.get(clientKey);
    loginFailures.set(clientKey, {
      count: current && current.resetAt > now ? current.count + 1 : 1,
      resetAt: current && current.resetAt > now ? current.resetAt : now + 15 * 60 * 1000,
    });
    response.status(401).json({ error: "That admin password was not accepted." });
    return;
  }
  loginFailures.delete(clientKey);
  setCookie(response, adminCookieName, makeAdminCookie(Date.now() + 8 * 60 * 60 * 1000), 8 * 60 * 60);
  response.json({ authenticated: true });
});

router.post("/admin/logout", requireTrustedOrigin, (_request, response) => {
  clearCookie(response, adminCookieName);
  response.json({ authenticated: false });
});

router.get("/admin/google/sign-in", (_request, response) => {
  try {
    if (!isGoogleAdminSignInConfigured()) {
      response.status(503).send("Google Director sign-in is not configured on the API.");
      return;
    }
    const { clientId, redirectUri } = requireGoogleConfig();
    const state = randomBytes(32).toString("base64url");
    setCookie(response, oauthStateCookieName, state, 10 * 60);
    setCookie(response, oauthFlowCookieName, "admin-sign-in", 10 * 60);
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      prompt: "select_account",
      scope: "openid email",
      state,
    }).toString();
    response.redirect(authorizationUrl.toString());
  } catch (error) {
    logger.error({ err: error }, "Could not start Google Director sign-in");
    response.status(503).send("Google Director sign-in is not configured on the API.");
  }
});

router.get("/admin/gmail/connect", (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    const { clientId, redirectUri } = requireGoogleConfig();
    const state = randomBytes(32).toString("base64url");
    setCookie(response, oauthStateCookieName, state, 10 * 60);
    setCookie(response, oauthFlowCookieName, "gmail", 10 * 60);
    const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    authorizationUrl.search = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: "https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email",
      state,
    }).toString();
    response.redirect(authorizationUrl.toString());
  } catch (error) {
    logger.error({ err: error }, "Could not start Gmail OAuth");
    response.status(503).json({ error: "Google Workspace connection is not configured on the API." });
  }
});

router.get("/admin/gmail/callback", async (request, response) => {
  const expectedState = readCookie(request, oauthStateCookieName);
  const oauthFlow = readCookie(request, oauthFlowCookieName);
  const isGoogleAdminSignIn = oauthFlow === "admin-sign-in";
  const submittedState = trimString(request.query["state"], 200);
  clearCookie(response, oauthStateCookieName);
  clearCookie(response, oauthFlowCookieName);
  if (!isGoogleAdminSignIn && !isAdmin(request)) {
    response.redirect(`${frontendUrl()}/dir?gmail=sign-in-required`);
    return;
  }
  if (!expectedState || !submittedState || expectedState !== submittedState) {
    response.redirect(`${frontendUrl()}/dir?${isGoogleAdminSignIn ? "google" : "gmail"}=state-error`);
    return;
  }
  try {
    const code = trimString(request.query["code"], 4096);
    if (!code || request.query["error"]) {
      response.redirect(`${frontendUrl()}/dir?${isGoogleAdminSignIn ? "google" : "gmail"}=cancelled`);
      return;
    }
    const { clientId, clientSecret, redirectUri } = requireGoogleConfig();
    const tokenResult = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const tokenBody = (await tokenResult.json()) as {
      access_token?: string;
      refresh_token?: string;
      error_description?: string;
    };
    if (!tokenResult.ok || !tokenBody.access_token) {
      throw new Error(tokenBody.error_description ?? "Google did not return an access token.");
    }
    const profileResult = await fetch(isGoogleAdminSignIn
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokenBody.access_token}` },
    });
    const profile = (await profileResult.json()) as {
      email?: string;
      email_verified?: boolean;
    };
    if (!profileResult.ok || !profile.email) {
      throw new Error("Google did not return the connected account email.");
    }
    if (isGoogleAdminSignIn) {
      const { director } = requireGoogleConfig();
      const approvedEmail = typeof director["admin_email"] === "string"
        ? director["admin_email"].trim().toLowerCase()
        : "";
      if (
        !isGoogleAdminSignInConfigured() ||
        profile.email_verified !== true ||
        profile.email.toLowerCase() !== approvedEmail
      ) {
        response.redirect(`${frontendUrl()}/dir?google=denied`);
        return;
      }
      setCookie(response, adminCookieName, makeAdminCookie(Date.now() + 8 * 60 * 60 * 1000), 8 * 60 * 60);
      response.redirect(`${frontendUrl()}/dir?google=connected`);
      return;
    }
    const db = await getDatabase();
    const [previousConnection] = await db
      .select()
      .from(directorMailConnections)
      .where(eq(directorMailConnections.id, mailConnectionId))
      .limit(1);
    const refreshToken = tokenBody.refresh_token
      ?? (previousConnection
        ? decryptToken(previousConnection.encryptedRefreshToken)
        : undefined);
    if (!refreshToken) {
      throw new Error("Google did not issue a refresh token. Reconnect and approve offline access.");
    }
    await db
      .insert(directorMailConnections)
      .values({
        id: mailConnectionId,
        email: profile.email.toLowerCase(),
        encryptedRefreshToken: encryptToken(refreshToken),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: directorMailConnections.id,
        set: {
          email: profile.email.toLowerCase(),
          encryptedRefreshToken: encryptToken(refreshToken),
          updatedAt: new Date(),
        },
      });
    response.redirect(`${frontendUrl()}/dir?gmail=connected`);
  } catch (error) {
    logger.error({ err: error }, "Could not finish Google OAuth");
    response.redirect(`${frontendUrl()}/dir?${isGoogleAdminSignIn ? "google" : "gmail"}=error`);
  }
});

router.post("/members", async (request, response) => {
  const retryAfter = consumeLimit(
    signupAttempts,
    request.ip || request.socket.remoteAddress || "unknown",
    8,
    15 * 60 * 1000,
  );
  if (retryAfter > 0) {
    response.setHeader("Retry-After", String(retryAfter));
    response.status(429).json({ error: "Too many member applications. Please try again later." });
    return;
  }
  const input = readMemberInput(request.body);
  if (!input) {
    if (!hasValidMemberOptions(request.body)) {
      response.status(400).json({ error: "Choose a valid role and title from the available options." });
      return;
    }
    response.status(400).json({ error: "Add a valid name and email address." });
    return;
  }
  const applicationIp = request.ip || request.socket.remoteAddress;
  if (!applicationIp) {
    response.status(503).json({ error: "Your application could not be recorded. Please try again later." });
    return;
  }
  const normalizedIp = applicationIp.startsWith("::ffff:")
    ? applicationIp.slice("::ffff:".length)
    : applicationIp;
  try {
    const db = await getDatabase();
    const { issuedAt, expiresAt } = expiryForTwoYears();
    const [member] = await db
      .insert(directorMembers)
      .values({
        ...input,
        applicationIp: normalizedIp,
        memberId: makeMemberId(),
        status: "pending",
        active: false,
        issuedAt,
        expiresAt,
        updatedAt: issuedAt,
      })
      .returning();
    if (!member) throw new Error("The member record was not returned after it was created.");
    response.status(201).json({ applicationInProcess: true });
  } catch (error) {
    const constraint = getErrorConstraint(error);
    if (
      getErrorCode(error) === "23505" &&
      (constraint === "director_members_application_ip_unique" ||
        constraint === "director_members_email_unique")
    ) {
      response.status(202).json({ applicationInProcess: true });
      return;
    }
    handleRouteError(response, error, "Could not create member");
  }
});

router.get("/admin/members", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    const db = await getDatabase();
    const members = await db.select().from(directorMembers).orderBy(desc(directorMembers.issuedAt));
    response.json({ members });
  } catch (error) {
    handleRouteError(response, error, "Could not load members");
  }
});

router.post(
  "/admin/members/:memberId/approve",
  requireTrustedOrigin,
  async (request, response) => {
    if (!requireAdmin(request, response)) return;
    try {
      const db = await getDatabase();
      const memberId = trimString(request.params["memberId"], 32);
      const { issuedAt, expiresAt } = expiryForTwoYears();
      const [member] = await db
        .update(directorMembers)
        .set({
          status: "approved",
          active: true,
          issuedAt,
          expiresAt,
          approvedAt: issuedAt,
          updatedAt: issuedAt,
        })
        .where(
          and(
            eq(directorMembers.memberId, memberId),
            eq(directorMembers.status, "pending"),
          ),
        )
        .returning();
      if (!member) {
        const [existingMember] = await db
          .select({ memberId: directorMembers.memberId })
          .from(directorMembers)
          .where(eq(directorMembers.memberId, memberId))
          .limit(1);
        response.status(existingMember ? 409 : 404).json({
          error: existingMember
            ? "This application is no longer pending."
            : "Member application not found.",
        });
        return;
      }
      try {
        await sendMail(
          member.email,
          "Your Director Games membership is approved",
          welcomeMessage(member),
        );
        response.json({ member, welcomeEmailSent: true });
      } catch (error) {
        logger.error(
          { err: error, memberId: member.memberId },
          "Member approved but welcome email could not be sent",
        );
        response.json({
          member,
          welcomeEmailSent: false,
          emailError:
            error instanceof Error
              ? error.message
              : "The welcome email could not be sent.",
        });
      }
    } catch (error) {
      handleRouteError(response, error, "Could not approve member application");
    }
  },
);

router.post(
  "/admin/members/:memberId/reject",
  requireTrustedOrigin,
  async (request, response) => {
    if (!requireAdmin(request, response)) return;
    try {
      const db = await getDatabase();
      const memberId = trimString(request.params["memberId"], 32);
      const [member] = await db
        .update(directorMembers)
        .set({
          status: "rejected",
          active: false,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(directorMembers.memberId, memberId),
            eq(directorMembers.status, "pending"),
          ),
        )
        .returning({ memberId: directorMembers.memberId });
      if (!member) {
        const [existingMember] = await db
          .select({ memberId: directorMembers.memberId })
          .from(directorMembers)
          .where(eq(directorMembers.memberId, memberId))
          .limit(1);
        response.status(existingMember ? 409 : 404).json({
          error: existingMember
            ? "This application is no longer pending."
            : "Member application not found.",
        });
        return;
      }
      response.json({ rejected: true });
    } catch (error) {
      handleRouteError(response, error, "Could not reject member application");
    }
  },
);

router.post("/admin/members/import", requireTrustedOrigin, async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const records =
    typeof request.body === "object" &&
    request.body !== null &&
    Array.isArray((request.body as Record<string, unknown>).members)
      ? (request.body as Record<string, unknown>).members as unknown[]
      : undefined;
  if (!records || records.length === 0 || records.length > 100) {
    response.status(400).json({ error: "Choose between 1 and 100 saved member cards to import." });
    return;
  }
  try {
    const db = await getDatabase();
    let importedCount = 0;
    for (const record of records) {
      const input = readMemberInput(record, true);
      if (!input) continue;
      const value = record as Record<string, unknown>;
      const issuedDate = typeof value["issuedAt"] === "string" ? new Date(value["issuedAt"]) : new Date();
      const expiryDate = typeof value["expiresAt"] === "string" ? new Date(value["expiresAt"]) : new Date();
      const issuedAt = Number.isNaN(issuedDate.getTime()) ? new Date() : issuedDate;
      const fallbackExpiry = new Date(issuedAt);
      fallbackExpiry.setFullYear(fallbackExpiry.getFullYear() + 2);
      const expiresAt = Number.isNaN(expiryDate.getTime()) ? fallbackExpiry : expiryDate;
      const memberId =
        typeof value["memberId"] === "string" && /^DG-\d{6}$/.test(value["memberId"])
          ? value["memberId"]
          : makeMemberId();
      const [inserted] = await db
        .insert(directorMembers)
        .values({
          ...input,
          memberId,
          status: "pending",
          active: false,
          issuedAt,
          expiresAt,
          updatedAt: new Date(),
        })
        .onConflictDoNothing()
        .returning({ memberId: directorMembers.memberId });
      if (inserted) importedCount += 1;
    }
    response.json({ importedCount, skippedCount: records.length - importedCount });
  } catch (error) {
    handleRouteError(response, error, "Could not import saved members");
  }
});

router.patch("/admin/members/:memberId", requireTrustedOrigin, async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const memberId = trimString(request.params["memberId"], 32);
  const body = typeof request.body === "object" && request.body !== null
    ? request.body as Record<string, unknown>
    : {};
  const updates: Partial<MemberInput> & { active?: boolean; updatedAt?: Date } = {};
  for (const field of memberFields) {
    if (field in body) {
      const value = trimString(body[field], 300);
      if (!value) {
        response.status(400).json({ error: `${field} cannot be empty.` });
        return;
      }
      if (field === "role" && !isMemberRole(value)) {
        response.status(400).json({ error: "Choose a role from the available options." });
        return;
      }
      if (field === "title" && !isMemberTitle(value)) {
        response.status(400).json({ error: "Choose a title from the available options." });
        return;
      }
      updates[field] = field === "email" ? value.toLowerCase() : value;
    }
  }
  if ("active" in body) {
    if (typeof body["active"] !== "boolean") {
      response.status(400).json({ error: "Active must be true or false." });
      return;
    }
    updates.active = body["active"];
  }
  if (Object.keys(updates).length === 0) {
    response.status(400).json({ error: "No member changes were provided." });
    return;
  }
  if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  updates.updatedAt = new Date();
  try {
    const db = await getDatabase();
    const [member] = await db
      .update(directorMembers)
      .set(updates)
      .where(eq(directorMembers.memberId, memberId))
      .returning();
    if (!member) {
      response.status(404).json({ error: "Member not found." });
      return;
    }
    response.json({ member });
  } catch (error) {
    if (getErrorCode(error) === "23505") {
      response.status(409).json({ error: "A member with that email already exists." });
      return;
    }
    handleRouteError(response, error, "Could not update member");
  }
});

router.delete("/admin/members/:memberId", requireTrustedOrigin, async (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    const db = await getDatabase();
    const [member] = await db
      .delete(directorMembers)
      .where(eq(directorMembers.memberId, trimString(request.params["memberId"], 32)))
      .returning({ memberId: directorMembers.memberId });
    if (!member) {
      response.status(404).json({ error: "Member not found." });
      return;
    }
    response.json({ deleted: true });
  } catch (error) {
    handleRouteError(response, error, "Could not delete member");
  }
});

router.post("/admin/members/:memberId/welcome", requireTrustedOrigin, async (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    const db = await getDatabase();
    const [member] = await db
      .select()
      .from(directorMembers)
      .where(eq(directorMembers.memberId, trimString(request.params["memberId"], 32)))
      .limit(1);
    if (!member) {
      response.status(404).json({ error: "Member not found." });
      return;
    }
    if (member.status !== "approved") {
      response.status(409).json({ error: "Approve this application before sending its welcome email." });
      return;
    }
    await sendMail(member.email, "Welcome to The Director Games", welcomeMessage(member));
    response.json({ sent: true });
  } catch (error) {
    logger.error({ err: error }, "Could not send member welcome email");
    response.status(502).json({
      error: error instanceof Error ? error.message : "Could not send the welcome email.",
    });
  }
});

router.post("/admin/broadcasts", requireTrustedOrigin, async (request, response) => {
  if (!requireAdmin(request, response)) return;
  const body = typeof request.body === "object" && request.body !== null
    ? request.body as Record<string, unknown>
    : {};
  const subject = trimString(body["subject"], 200);
  const message = trimString(body["body"], 10000);
  if (!subject || /[\r\n]/.test(subject) || !message) {
    response.status(400).json({ error: "Add a subject and message before sending." });
    return;
  }
  try {
    const db = await getDatabase();
    const members = await db
      .select()
      .from(directorMembers)
      .where(
        and(
          eq(directorMembers.active, true),
          eq(directorMembers.status, "approved"),
        ),
      )
      .orderBy(desc(directorMembers.issuedAt));
    if (members.length === 0) {
      response.status(400).json({ error: "There are no active members to email." });
      return;
    }
    const { accessToken, sender } = await getAccessToken();
    let failedCount = 0;
    const failures: string[] = [];
    for (const member of members) {
      try {
        await sendMailWithAccessToken(member.email, subject, message, accessToken, sender);
      } catch (error) {
        failedCount += 1;
        failures.push(member.memberId);
        logger.error(
          { err: error, memberId: member.memberId },
          "Broadcast email delivery failed",
        );
      }
    }
    const [broadcast] = await db
      .insert(directorBroadcasts)
      .values({
        subject,
        body: message,
        recipientCount: members.length,
        failedCount,
      })
      .returning();
    response.status(failedCount === members.length ? 502 : 201).json({
      broadcast,
      sentCount: members.length - failedCount,
      failedCount,
      failedMemberIds: failures,
      ...(failedCount === members.length
        ? { error: "No member emails were delivered. Check the Gmail connection and retry." }
        : {}),
    });
  } catch (error) {
    handleRouteError(response, error, "Could not send member broadcast");
  }
});

router.get("/admin/broadcasts", async (request, response) => {
  if (!requireAdmin(request, response)) return;
  try {
    const db = await getDatabase();
    const broadcasts = await db
      .select()
      .from(directorBroadcasts)
      .orderBy(desc(directorBroadcasts.sentAt))
      .limit(50);
    response.json({ broadcasts });
  } catch (error) {
    handleRouteError(response, error, "Could not load broadcast history");
  }
});

export default router;
