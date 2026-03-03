import { execa } from "execa";

export async function handleUpgrade(): Promise<void> {
  try {
    await execa("npm", ["install", "-g", "git-orchard@latest"], {
      stdio: "inherit",
    });
    process.exit(0);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    console.error("Upgrade failed:", message);
    process.exit(1);
  }
}
