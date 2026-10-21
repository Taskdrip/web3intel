import { db, pool, usersTable } from "@workspace/db";

type ClerkUser = {
  id: string;
  primary_email_address_id: string | null;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification?: { status?: string } | null;
  }>;
};

async function promoteAdmin(): Promise<void> {
  const identity = process.argv.slice(2).find((argument) => argument !== "--")?.trim();
  const email = identity?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Provide an existing verified Clerk account email.");
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is not configured in this environment.");

  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.append("email_address[]", email);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${secretKey}`, accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`Clerk could not verify the account (HTTP ${response.status}).`);
  }

  const users = (await response.json()) as ClerkUser[];
  const matches = users.filter((user) =>
    user.email_addresses.some(
      (address) =>
        address.email_address.toLowerCase() === email &&
        address.id === user.primary_email_address_id &&
        address.verification?.status === "verified",
    ),
  );
  if (matches.length !== 1) {
    throw new Error(
      matches.length === 0
        ? "No account with that verified primary email was found. Sign up and verify it first."
        : "More than one verified account matched. No role was changed.",
    );
  }

  await db
    .insert(usersTable)
    .values({ clerkUserId: matches[0]!.id, role: "admin", status: "active" })
    .onConflictDoUpdate({
      target: usersTable.clerkUserId,
      set: { role: "admin", status: "active", updatedAt: new Date() },
    });

  process.stdout.write("Administrator access granted to the verified account.\n");
}

try {
  await promoteAdmin();
} catch (error) {
  const message = error instanceof Error ? error.message : "Admin promotion failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
