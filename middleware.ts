import { NextRequest, NextResponse } from "next/server";

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

export function middleware(request: NextRequest): NextResponse {
  const requestId = resolveRequestId(request);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/api/:path*"],
};
