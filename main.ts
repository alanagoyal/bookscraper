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
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

dotenv.config();

// Parse command line arguments
const args = process.argv.slice(2);
const urlArg = args.find(arg => arg.startsWith('--url='));
const URL = urlArg ? urlArg.split('=')[1] : null;

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

    // Extract the person's name from the page
    const { personName } = await page.extract({
      instruction: "Extract the name of the person whose book recommendations are being shown. This is likely in the page title or header.",
      schema: z.object({
        personName: z.string().describe("The full name of the person whose book recommendations are shown"),
      }),
      useTextExtract: false, // Since we're extracting a short piece of text
    });

    if (!personName) {
      console.error(chalk.red("Could not find the person's name on the page"));
      return;
    }

    console.log(chalk.blue("Found recommendations for:"), personName);

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

    let personId;
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
      // Insert book
      const bookId = uuidv4();
      const { error: bookError } = await supabase
        .from('books')
        .insert({
          id: bookId,
          title: book.title.trim(),
          author: book.author.trim(),
          genre: ['Unknown'],
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (bookError) {
        console.error(chalk.red(`Error inserting book "${book.title}":`, bookError.message));
        continue;
      }

      // Create recommendation
      const { error: recError } = await supabase
        .from('recommendations')
        .insert({
          id: uuidv4(),
          book_id: bookId,
          person_id: personId,
          source_link: URL,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (recError) {
        console.error(chalk.red(`Error creating recommendation for "${book.title}":`, recError.message));
        continue;
      }

      console.log(chalk.green(`✓ Successfully added "${book.title}" to database`));
    }

    // Log total count
    console.log(chalk.green(`\nTotal books processed: ${books.length}`));

  } catch (error) {
    console.error(chalk.red("Error occurred while scraping:"));
    console.error(error);
    process.exit(1);
  }
}
