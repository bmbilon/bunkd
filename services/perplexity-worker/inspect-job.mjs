import fs from "fs";
import path from "path";

function loadDotEnv(filePath) {
  const p = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(p)) throw new Error(`Missing ${p}`);
  const txt = fs.readFileSync(p, "utf8");
  for (const raw of txt.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const jobId = process.argv[2];
if (!jobId) {
  console.error("Usage: node inspect-job.mjs <job_id_uuid>");
  process.exit(1);
}

loadDotEnv(".env");

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in services/perplexity-worker/.env");
  process.exit(1);
}

const { createClient } = await import("@supabase/supabase-js");
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  // 1) Show the job row (these columns exist in the migration you pushed)
  const jobRes = await supabase
    .from("analysis_jobs")
    .select("id,status,attempts,created_at,updated_at,claimed_at,claimed_by,started_at,completed_at,last_error,input_type,input_text,input_url")
    .eq("id", jobId)
    .maybeSingle();

  if (jobRes.error) {
    console.error("ERROR reading analysis_jobs:", jobRes.error);
    process.exit(1);
  }
  if (!jobRes.data) {
    console.error("No job found with id:", jobId);
    process.exit(1);
  }

  console.log("\n=== analysis_jobs row ===");
  console.log(JSON.stringify(jobRes.data, null, 2));

  // 2) Show any results row (if your schema includes it)
  const resultsRes = await supabase
    .from("analysis_results")
    .select("*")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false })
    .limit(3);

  console.log("\n=== analysis_results rows (up to 3) ===");
  if (resultsRes.error) {
    console.log("analysis_results query error (may not exist yet / different name):");
    console.log(resultsRes.error);
  } else {
    console.log(JSON.stringify(resultsRes.data, null, 2));
  }

  // 3) Quick health: can the worker see the queue at all?
  const queueRes = await supabase
    .from("analysis_jobs")
    .select("id,status,created_at")
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(5);

  console.log("\n=== recent queued/processing jobs (up to 5) ===");
  if (queueRes.error) {
    console.log("queue query error:");
    console.log(queueRes.error);
  } else {
    console.log(JSON.stringify(queueRes.data, null, 2));
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
