import { NextRequest, NextResponse } from "next/server";

function resolveRequestId(request: NextRequest): string {
  const incomingRequestId = request.headers.get("x-request-id")?.trim();
  if (incomingRequestId) {
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
