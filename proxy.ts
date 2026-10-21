import { NextRequest, NextResponse } from "next/server";
import { REQUEST_RETURN_TO_HEADER } from "@/lib/navigation/return-to";

const REQUEST_ID_MAX_LENGTH = 128;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

function isValidRequestId(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= REQUEST_ID_MAX_LENGTH &&
    REQUEST_ID_PATTERN.test(value)
  );
}

function resolveRequestId(request: NextRequest): string {
  const incomingRequestId = request.headers.get("x-request-id")?.trim();
  if (incomingRequestId && isValidRequestId(incomingRequestId)) {
    return incomingRequestId;
  }

  return crypto.randomUUID();
}

export function proxy(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);
  // Derive this on the server; never trust a caller-supplied return destination.
  requestHeaders.delete(REQUEST_RETURN_TO_HEADER);
  if (request.nextUrl.pathname.startsWith("/projects")) {
    requestHeaders.set(
      REQUEST_RETURN_TO_HEADER,
      `${request.nextUrl.pathname}${request.nextUrl.search}`
    );
  }

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*", "/projects/:path*"],
};
