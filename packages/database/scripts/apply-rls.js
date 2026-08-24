// Applies prisma/rls.sql against DATABASE_URL. Re-run whenever a new
// tenant-scoped table is added to the schema (see prisma/rls.sql).
// Requires DATABASE_URL to already be set in the environment (e.g.
// `set -a; source .env; set +a` first, or export it inline).
const fs = require("node:fs");
const path = require("node:path");
const { PrismaClient } = require("../generated/client");

async function main() {
  const sql = fs.readFileSync(path.join(__dirname, "..", "prisma", "rls.sql"), "utf8");
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(sql);
    console.log("RLS policies applied.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
