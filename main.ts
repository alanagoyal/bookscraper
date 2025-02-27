/**
 * Book scraper to extract titles and authors from a webpage
 *
 * TO RUN THIS PROJECT:
 * ```
 * npm install
 * npm run start -- --url="YOUR_URL_HERE"
 * ```
 */
import { Page, BrowserContext, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import chalk from "chalk";
import dotenv from "dotenv";

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('--url='));
const URL = urlArg ? urlArg.split('=')[1] : null;

interface Book {
  title: string;
  author: string;
}

export async function main({
  page,
  context,
  stagehand,
}: {
  page: Page;
  context: BrowserContext;
  stagehand: Stagehand;
}) {
  if (!URL) {
    console.error(chalk.red("Please provide a URL to scrape using --url=<URL>"));
    return;
  }

  console.log(chalk.green("Scraping URL:"), URL);

  try {
    // Set a more realistic user agent
    await context.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // Navigate to the provided URL with a longer timeout
    await page.goto(URL);

    // Extract information for all books
    const { books } = await page.extract({
      instruction:
        "Extract all books from the webpage. Each book should be in a table row containing elements with class 'bookTitle' for the title and elements containing author information. Make sure to clean up any extra whitespace.",
      schema: z.object({
        books: z
          .array(
            z.object({
              title: z.string().describe("The title of the book"),
              author: z.string().describe("The author of the book"),
            })
          )
          .describe("Array of all books found on the page"),
      }),
      useTextExtract: true, // NET NEW
    });

    // Log the extracted information
    console.log(chalk.green("\nExtracted Books:"));
    books.forEach((book: Book, index: number) => {
      console.log(chalk.yellow(`\nBook ${index + 1}:`));
      console.log(chalk.blue("Title:"), book.title.trim());
      console.log(chalk.blue("Author:"), book.author.trim());
    });

    // Log total count
    console.log(chalk.green(`\nTotal books found: ${books.length}`));

  } catch (error) {
    console.error(chalk.red("Error occurred while scraping:"));
    console.error(error);
    process.exit(1);
  }
}
