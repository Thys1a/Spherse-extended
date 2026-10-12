import { describe, expect, it } from "vitest";
import {
  GITHUB_API_REPO_URL,
  GITHUB_RELEASES_LATEST_URL,
  GITHUB_RELEASES_TAG_URL_BASE,
  GITHUB_REPO_URL,
} from "./urls";

describe("lib/urls", () => {
  it("derives github urls from the repo url with exact shapes", () => {
    expect(GITHUB_REPO_URL).toBe("https://github.com/Thys1a/Spherse-extended");
    expect(GITHUB_RELEASES_LATEST_URL).toBe(
      "https://github.com/Thys1a/Spherse-extended/releases/latest",
    );
    expect(GITHUB_RELEASES_TAG_URL_BASE).toBe(
      "https://github.com/Thys1a/Spherse-extended/releases/tag",
    );
    expect(GITHUB_API_REPO_URL).toBe(
      "https://api.github.com/repos/Thys1a/Spherse-extended",
    );
  });
});
