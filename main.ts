/**
 * Book scraper to extract titles and authors from a webpage
 *
 * TO RUN THIS PROJECT:
 * ```
 * npm install
 * npm run start -- --name="PERSON_NAME_HERE"
 * ```
 */
import { Page, BrowserContext, Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import chalk from "chalk";
import dotenv from "dotenv";
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { invoke } from "braintrust";
import { initLogger } from "braintrust";

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const nameArg = args.find(arg => arg.startsWith('--name='));
const personName = nameArg ? nameArg.split('=')[1] : null;

// Braintrust logger
initLogger({
  projectName: "booklist",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function stripUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    // Remove www. prefix and .com/.org etc suffix
    return urlObj.hostname
      .replace(/^www\./, '')
      .replace(/\.(com|org|net|edu|gov|io)$/, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch (e) {
    // If URL parsing fails, return the original string
    return url;
  }
}

export async function getSourceName(url: string) {
  const siteName = stripUrl(url);
  return { siteName };
}

export async function generateGenreAndDescription(title: string, author: string) {
  const result = await invoke({
    projectName: "booklist",
    slug: "genre-and-description-0680",
    input: {
      title,
      author
    },
    schema: z.object({
      genre: z.array(z.string()),
      description: z.string()
    }),
  });
  console.log(result);
  return result;
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
  if (!personName) {
    console.error(chalk.red("Please provide a name using --name=<NAME>"));
    return;
  }

  console.log(chalk.green("Searching for book recommendations by:"), personName);

  try {
    // Set a more realistic user agent
    await context.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // First, navigate to Google
    await page.goto('https://www.google.com');

    // Accept cookies if the dialog appears
    const results = await page.observe("Click accept all cookies button if it exists");
    if (results.length > 0) {
      await page.act(results[0]);
    }

    // Search for book recommendations
    const searchQuery = `${personName} book recommendations`;
    await page.extract({
      instruction: "Type into the Google search box",
      schema: z.object({ success: z.boolean() }),
      useTextExtract: false
    });
    await page.keyboard.type(searchQuery);
    await page.keyboard.press('Enter');

    // Wait for search results to load
    await page.waitForSelector('#search');
    await page.waitForTimeout(1500); // Give a moment for results to stabilize

    // Click the first search result
    const results2 = await page.observe("Click the first search result");
    await page.act(results2[0]);

    // Wait for content to be visible
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Give time for dynamic content to load

    // Extract the source name
    const currentUrl = page.url();
    const { siteName: sourceName } = await getSourceName(currentUrl);

    console.log(chalk.blue("Source:"), sourceName);

    // Create or find the person first
    const { data: existingPerson, error: personQueryError } = await supabase
      .from('people')
      .select('id')
      .eq('full_name', personName)
      .single();

    if (personQueryError && personQueryError.code !== 'PGRST116') { // PGRST116 is "not found" error
      console.error(chalk.red(`Error finding person "${personName}": ${personQueryError.message}`));
      return;
    }

    let personId: string;
    if (existingPerson) {
      personId = existingPerson.id;
      console.log(chalk.green(`Found existing entry for ${personName}`));
    } else {
      const newPersonId = uuidv4();
      const { error: personInsertError } = await supabase
        .from('people')
        .insert({
          id: newPersonId,
          full_name: personName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (personInsertError) {
        console.error(chalk.red(`Error creating person "${personName}": ${personInsertError.message}`));
        return;
      }
      personId = newPersonId;
      console.log(chalk.green(`Created new entry for ${personName}`));
    }

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
      useTextExtract: true,
    });

    // Insert books and create recommendations
    console.log(chalk.green("\nInserting books into database:"));
    for (const book of books) {
      // Check if book already exists
      const { data: existingBook, error: searchError } = await supabase
        .from('books')
        .select('id')
        .eq('title', book.title.trim())
        .eq('author', book.author.trim())
        .single();

      if (searchError && searchError.code !== 'PGRST116') {
        console.error(chalk.red(`Error searching for book "${book.title}": ${searchError.message}`));
        continue;
      }

      let bookId;
      if (existingBook) {
        bookId = existingBook.id;
        console.log(chalk.blue(`Found existing book: ${book.title}`));
      } else {
        // Generate genre and description before inserting
        const { genre, description } = await generateGenreAndDescription(book.title.trim(), book.author.trim());
        
        const newBookId = uuidv4();
        const { error: bookInsertError } = await supabase
          .from('books')
          .insert({
            id: newBookId,
            title: book.title.trim(),
            author: book.author.trim(),
            genre,
            description,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (bookInsertError) {
          console.error(chalk.red(`Error inserting book "${book.title}": ${bookInsertError.message}`));
          continue;
        }
        bookId = newBookId;
        console.log(chalk.green(`Created new book: ${book.title}`));
      }

      // Check if recommendation already exists
      const { data: existingRec, error: recSearchError } = await supabase
        .from('recommendations')
        .select('id')
        .eq('book_id', bookId)
        .eq('person_id', personId)
        .eq('source', sourceName)
        .single();

      if (recSearchError && recSearchError.code !== 'PGRST116') {
        console.error(chalk.red(`Error searching for existing recommendation: ${recSearchError.message}`));
        continue;
      }

      if (existingRec) {
        console.log(chalk.blue(`Recommendation for "${book.title}" from ${sourceName} already exists`));
        continue;
      }

      // Create recommendation
      const { error: recError } = await supabase
        .from('recommendations')
        .insert({
          id: uuidv4(),
          book_id: bookId,
          person_id: personId,
          source: sourceName,
          source_link: page.url(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (recError) {
        console.error(chalk.red(`Error creating recommendation for "${book.title}": ${recError.message}`));
        continue;
      }

      console.log(chalk.green(`✓ Successfully ${existingBook ? 'added recommendation for' : 'added'} "${book.title}" to database`));
    }

    // Log total count
    console.log(chalk.green(`\nTotal books processed: ${books.length}`));

  } catch (error) {
    console.error(chalk.red("Error occurred while scraping:"));
    console.error(error);
    process.exit(1);
  }
}
