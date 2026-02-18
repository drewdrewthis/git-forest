import { execa } from "execa";
import type { PrInfo, ReviewDecision } from "./types.js";

export async function getPrForBranch(
  branch: string
): Promise<PrInfo | null> {
  try {
    const { stdout } = await execa("gh", [
      "pr",
      "list",
      "--head",
      branch,
      "--state",
      "all",
      "--json",
      "number,state,title,url,reviewDecision",
      "--limit",
      "1",
    ]);

    const results = JSON.parse(stdout);
    if (!results.length) return null;

    const pr = results[0];
    return {
      number: pr.number,
      state: pr.state.toLowerCase() as PrInfo["state"],
      title: pr.title,
      url: pr.url,
      reviewDecision: (pr.reviewDecision || "") as ReviewDecision,
    };
  } catch {
    // gh not installed or not authenticated or not a GitHub repo
    return null;
  }
}

export async function isGhAvailable(): Promise<boolean> {
  try {
    await execa("gh", ["auth", "status"]);
    return true;
  } catch {
    return false;
  }
}
