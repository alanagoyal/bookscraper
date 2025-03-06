/**
 * Book scraper to extract titles and authors from a webpage
 *
 * TO RUN THIS PROJECT:
 * ```
 * npm install
 * npm run start
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
import { findAmazonUrl } from './amazon-links.ts';
import inquirer from 'inquirer';

dotenv.config();

async function promptUser() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'personName',
      message: 'Enter the name of the person whose book recommendations you want to search for:',
      validate: (input) => {
        if (!input.trim()) {
          return 'Name is required';
        }
        return true;
      }
    },
    {
      type: 'input',
      name: 'targetUrl',
      message: 'Enter a specific URL to scrape (optional, press Enter to skip):',
    }
  ]);

  return {
    personName: answers.personName.trim(),
    targetUrl: answers.targetUrl.trim() || null
  };
}

// Parse command line arguments
async function getArgs() {
  const args = await promptUser();
  return args;
}

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

function toTitleCase(text: string): string {
  // List of words that should not be capitalized (unless they're the first word)
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);

  return text.toLowerCase().split(' ').map((word, index) => {
    // Always capitalize the first word, last word, or if it's not a minor word
    if (index === 0 || !minorWords.has(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  }).join(' ');
}

function cleanAuthorName(author: string): string {
  return author
    .trim()
    .replace(/^by\s+/i, '')  // Remove 'by ' prefix (case insensitive)
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim();
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
  return result;
}

async function findAndClickBookLink(page: Page, bookTitle: string) {
  // Try different approaches to find the book link
  const instructions = [
    `Find and click the link or button that would take you to purchase or view "${bookTitle}" on Amazon`,
    `Find and click the "Get on Amazon" or similar link for "${bookTitle}"`,
    `Click the link that contains "${bookTitle}" and leads to Amazon`,
    `Click any button or link that would take you to buy "${bookTitle}"`
  ];

  for (const instruction of instructions) {
    try {
      const results = await page.observe({
        instruction,
        onlyVisible: false,
        returnAction: true
      });

      if (results && results.length > 0) {
        await page.act(results[0]);
        return true;
      }
    } catch (error) {
      console.log(chalk.yellow(`Attempt failed with instruction: ${instruction}`));
      continue;
    }
  }
  
  return false;
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
  try {
    // Set a more realistic user agent
    await context.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    let currentUrl: string;

    const { personName, targetUrl } = await getArgs();

    if (!personName) {
      throw new Error('A name is required to search for book recommendations');
    }

    if (targetUrl) {
      // If URL is provided, go directly to it
      console.log(chalk.green("Going directly to URL:"), targetUrl);
      await page.goto(targetUrl);
      currentUrl = targetUrl;
    } else {
      // Search flow using person's name
      console.log(chalk.green("Searching for book recommendations by:"), personName);

      // First, navigate to Google
      await page.goto('https://www.google.com');

      // Accept cookies if the dialog appears
      const results = await page.observe("Click accept all cookies button if it exists");
      if (results.length > 0) {
        await page.act(results[0]);
      }

      // Search for book recommendations
      const searchQuery = `${personName} book recommendations`;
      await page.act("Type '" + searchQuery + "' into the Google search box");
      await page.act("Click the Google Search button");
      await page.act("Click the first search result whose title contains 'book recommendations'");
      currentUrl = page.url();
    }

    // Extract the source name
    const { siteName: sourceNameOriginal } = await getSourceName(currentUrl);
    
    // Replace Kevinrooke with Bookmarked
    const sourceName = sourceNameOriginal === "Kevinrooke" ? "Bookmarked" : sourceNameOriginal;

    console.log(chalk.blue("Source:"), sourceName);

    // Extract information for all books
    const { books } = await page.extract({
      instruction:
        "Look for a list or collection of book recommendations on the page. Only extract items that are clearly books being recommended. Each book must have both a title and author. For each book found:\n" +
        "1. The title should be a proper book title (not article titles, headers, or navigation text)\n" +
        "2. The author should be the actual writer of the book - NOT the person whose recommendations we're viewing\n" +
        "3. The author should be just the person's name without any prefix like 'by' or similar\n" +
        "4. Skip any items where you can't find both a clear book title AND its actual author\n" +
        "5. Skip any items where the author name matches or is similar to the person whose recommendations we're viewing\n" +
        "If you don't find any clear book recommendations with both title and author, return an empty array.",
      schema: z.object({
        books: z
          .array(
            z.object({
              title: z.string().describe("The title of the book - must be an actual book title"),
              author: z.string().describe("The actual author who wrote the book - must be a person's name and NOT the person whose recommendations we're viewing"),
            })
          )
          .describe("Array of book recommendations found on the page"),
      }),
      useTextExtract: true,
    });

    // Check if any books were found
    if (!books || books.length === 0) {
      console.log(chalk.yellow("No book recommendations found on this page."));
      return;
    }

    // Process each book
    for (const book of books) {
      console.log(chalk.blue("\nProcessing book:"), chalk.white(book.title));
      
      // Try to find and click the book link
      const linkFound = await findAndClickBookLink(page, book.title);
      
      if (linkFound) {        
        // Store the Amazon URL
        const amazonUrl = page.url();
        console.log(chalk.green("Found Amazon link:"), amazonUrl);
        
        // Go back to the recommendations page
        await page.goBack();
      } else {
        console.log(chalk.yellow(`Could not find Amazon link for: ${book.title}`));
      }
    }

    // Only create/find person if we found book recommendations
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

    // Insert books and create recommendations
    console.log(chalk.green("\nInserting books into database:"));
    const processedBooks = [];
    for (const book of books) {
      // Check if book already exists by title and author (case insensitive)
      const { data: existingBook, error: bookSearchError } = await supabase
        .from('books')
        .select('id')
        .ilike('title', book.title.trim().toLowerCase())
        .ilike('author', cleanAuthorName(book.author).toLowerCase())
        .single();

      if (bookSearchError && bookSearchError.code !== 'PGRST116') {
        console.error(chalk.red(`Error searching for existing book: ${bookSearchError.message}`));
        continue;
      }

      let bookId;
      if (existingBook) {
        console.log(chalk.blue(`Book "${book.title}" already exists`));
        bookId = existingBook.id;
      } else {
        // Generate genre and description before inserting
        const { genre, description } = await generateGenreAndDescription(toTitleCase(book.title.trim()), cleanAuthorName(book.author));
        
        // Find Amazon URL for the book
        console.log(chalk.blue('Finding Amazon URL...'));
        const amazonUrl = await findAmazonUrl(page, book.title, book.author);
        console.log(amazonUrl ? chalk.green('Found Amazon URL') : chalk.yellow('No Amazon URL found'));
        
        bookId = uuidv4();
        const { error: bookInsertError } = await supabase
          .from('books')
          .insert({
            id: bookId,
            title: toTitleCase(book.title.trim()),
            author: cleanAuthorName(book.author),
            genre,
            description,
            amazon_url: amazonUrl,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (bookInsertError) {
          console.error(chalk.red(`Error inserting book "${book.title}": ${bookInsertError.message}`));
          continue;
        }
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
          source_link: currentUrl,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });

      if (recError) {
        console.error(chalk.red(`Error creating recommendation for "${book.title}": ${recError.message}`));
        continue;
      }

      console.log(chalk.green(`✓ Successfully added "${book.title}" to database`));
      processedBooks.push(book);
    }

    // Log total count
    console.log(chalk.green(`\nTotal books processed: ${processedBooks.length}`));

  } catch (error) {
    console.error(chalk.red("Error occurred while scraping:"));
    console.error(error);
    process.exit(1);
  }
}
