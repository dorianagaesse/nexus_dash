import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

// Keep database-backed functions in the AWS region named by the Supabase
// transaction-pooler host. Emit only the Vercel region, never the connection URL.
const vercelRegionByAwsRegion = {
  "af-south-1": "cpt1",
  "ap-east-1": "hkg1",
  "ap-northeast-1": "hnd1",
  "ap-northeast-2": "icn1",
  "ap-northeast-3": "kix1",
  "ap-south-1": "bom1",
  "ap-southeast-1": "sin1",
  "ap-southeast-2": "syd1",
  "ca-central-1": "yul1",
  "eu-central-1": "fra1",
  "eu-north-1": "arn1",
  "eu-west-1": "dub1",
  "eu-west-2": "lhr1",
  "eu-west-3": "cdg1",
  "me-central-1": "dxb1",
  "sa-east-1": "gru1",
  "us-east-1": "iad1",
  "us-east-2": "cle1",
  "us-west-1": "sfo1",
  "us-west-2": "pdx1",
};

export function resolveVercelFunctionRegion(databaseUrl) {
  let host;
  try {
    host = new URL(databaseUrl).hostname.toLowerCase();
  } catch {
    throw new Error("DATABASE_URL must be a valid Supabase pooler URL.");
  }

  const awsRegion = /^aws-\d+-([a-z]{2}-[a-z]+-\d+)\.pooler\.supabase\.com$/.exec(host)?.[1];
  const vercelRegion = awsRegion && vercelRegionByAwsRegion[awsRegion];
  if (!vercelRegion) {
    throw new Error("Cannot map the Supabase runtime pooler region to a Vercel Function region.");
  }

  return vercelRegion;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.stdout.write(`VERCEL_FUNCTION_REGION=${resolveVercelFunctionRegion(process.env.DATABASE_URL)}\n`);
}
