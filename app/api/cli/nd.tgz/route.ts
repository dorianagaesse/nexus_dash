import { NextResponse } from "next/server";

import { buildNdCliTarball } from "@/lib/cli/nd-cli-bundle";

export async function GET() {
  const tarball = await buildNdCliTarball();
  return new NextResponse(new Uint8Array(tarball), {
    status: 200,
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": 'attachment; filename="nexusdash-nd-cli.tgz"',
      "Cache-Control": "public, max-age=300",
    },
  });
}
