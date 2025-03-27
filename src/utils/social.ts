import chalk from "chalk";
import { z } from "zod";

// Helper function to find social URL using stagehand
export async function findSocialUrl(
  page: any,
  personName: string,
  type: string,
): Promise<string | null> {
  await page.goto("https://www.google.com");
  const searchQuery = `${personName} (${type})`;

  await page.act(`Type '${searchQuery}' into the search input`);
  await page.act("Press Enter");

  // Set timeout for 2 seconds
  await new Promise((resolve) => setTimeout(resolve, 2000));

  const { links } = await page.extract({
    instruction: "Extract the first link from the search results. Make sure it is a valid URL.",
    schema: z.object({
      links: z.array(z.string()),
    }),
    useTextExtract: false,
  });

  if (links && links.length > 0) {
    console.log(chalk.cyan(`\nFound link: ${links[0]}`));
    return links[0];
  }

  return null;
}

// Helper function to standardize Twitter URL
export function sanitizeTwitterUrl(url: string | null): string | null {
  if (!url) return null;

  // Only process Twitter/X URLs
  if (
    !url.toLowerCase().includes("twitter.com") &&
    !url.toLowerCase().includes("x.com")
  ) {
    return url;
  }

  try {
    // If it's a full URL, parse it and extract just the username
    if (url.startsWith("http")) {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split("/").filter((part) => part);
      // If we have a username in the path, use it
      if (pathParts.length > 0) {
        return `https://x.com/${pathParts[0]}`;
      }
    }

    // If it's just a username (with or without @)
    if (url.match(/^@?[a-zA-Z0-9_]+$/)) {
      return `https://x.com/${url.replace("@", "")}`;
    }

    // Try to extract username from twitter.com/username format
    const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
    if (match && match[1]) {
      return `https://x.com/${match[1]}`;
    }

    // If we can't parse it in any known format, return unchanged
    return url;
  } catch (error) {
    // If URL parsing fails, return unchanged
    return url;
  }
}
