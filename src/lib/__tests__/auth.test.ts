// @vitest-environment node
import { vi, test, expect, beforeEach } from "vitest";
import { SignJWT } from "jose";

vi.mock("server-only", () => ({}));

const mockCookieStore = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
};

vi.mock("next/headers", () => ({
  cookies: vi.fn(() => Promise.resolve(mockCookieStore)),
}));

import { createSession, getSession, deleteSession, verifySession } from "@/lib/auth";
import { NextRequest } from "next/server";

const JWT_SECRET = new TextEncoder().encode("development-secret-key");

beforeEach(() => {
  vi.clearAllMocks();
});

async function makeToken(userId: string, email: string, expirationTime = "7d") {
  return new SignJWT({ userId, email, expiresAt: new Date() })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(expirationTime)
    .setIssuedAt()
    .sign(JWT_SECRET);
}

test("createSession sets an httpOnly cookie containing a JWT", async () => {
  await createSession("user-123", "test@example.com");

  expect(mockCookieStore.set).toHaveBeenCalledOnce();
  const [name, token, options] = mockCookieStore.set.mock.calls[0];
  expect(name).toBe("auth-token");
  expect(token.split(".")).toHaveLength(3);
  expect(options.httpOnly).toBe(true);
  expect(options.path).toBe("/");
});

test("getSession returns null when no cookie is present", async () => {
  mockCookieStore.get.mockReturnValue(undefined);

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns the session payload for a valid token", async () => {
  const token = await makeToken("user-123", "test@example.com");
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session?.userId).toBe("user-123");
  expect(session?.email).toBe("test@example.com");
});

test("getSession returns null for a malformed token", async () => {
  mockCookieStore.get.mockReturnValue({ value: "not.a.jwt" });

  const session = await getSession();
  expect(session).toBeNull();
});

test("getSession returns null for an expired token", async () => {
  const token = await makeToken("user-123", "test@example.com", "-1s");
  mockCookieStore.get.mockReturnValue({ value: token });

  const session = await getSession();
  expect(session).toBeNull();
});

test("deleteSession removes the auth cookie", async () => {
  await deleteSession();
  expect(mockCookieStore.delete).toHaveBeenCalledWith("auth-token");
});

test("verifySession returns null when request has no cookie", async () => {
  const request = new NextRequest("http://localhost:3000/api/test");

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns the session payload for a valid token", async () => {
  const token = await makeToken("user-456", "user@example.com");
  const request = new NextRequest("http://localhost:3000/api/test", {
    headers: { cookie: `auth-token=${token}` },
  });

  const session = await verifySession(request);
  expect(session?.userId).toBe("user-456");
  expect(session?.email).toBe("user@example.com");
});

test("verifySession returns null for a malformed token", async () => {
  const request = new NextRequest("http://localhost:3000/api/test", {
    headers: { cookie: "auth-token=invalid.token.value" },
  });

  const session = await verifySession(request);
  expect(session).toBeNull();
});

test("verifySession returns null for an expired token", async () => {
  const token = await makeToken("user-789", "expired@example.com", "-1s");
  const request = new NextRequest("http://localhost:3000/api/test", {
    headers: { cookie: `auth-token=${token}` },
  });

  const session = await verifySession(request);
  expect(session).toBeNull();
});
