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
import inquirer from 'inquirer';
import readline from 'readline';

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Braintrust logger
initLogger({
  projectName: "booklist",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

// Helper Functions
function stripUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname
      .replace(/^www\./, '')
      .replace(/\.(com|org|net|edu|gov|io)$/, '')
      .split('.')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  } catch (e) {
    return url;
  }
}

export function getSourceName(url: string): string {
  const sourceNameOriginal = stripUrl(url);
  return sourceNameOriginal === "Kevinrooke" ? "Bookmarked" : sourceNameOriginal;
}

function toTitleCase(text: string): string {
  const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the', 'to', 'up', 'yet']);
  return text.toLowerCase().split(' ').map((word, index) => {
    if (index === 0 || !minorWords.has(word)) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    }
    return word;
  }).join(' ');
}

function cleanAuthorName(author: string): string {
  return author
    .trim()
    .replace(/^by\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getBasicTitle(title: string): string {
  return title.split(':')[0].trim();
}

// Core Functions
async function promptUser() {
  const urlType = await inquirer.prompt([
    {
      type: 'list',
      name: 'type',
      message: 'What type of URL do you have?',
      choices: [
        { name: 'URL with a collection of recommenders', value: 'collection' },
        { name: 'URL for a specific recommender', value: 'specific' }
      ]
    }
  ]);

  const urlPrompt = await inquirer.prompt([
    {
      type: 'input',
      name: 'url',
      message: urlType.type === 'collection' 
        ? 'Enter the URL of the main book recommenders page:'
        : 'Enter the URL of the specific recommender page:',
      validate: (input) => {
        if (!input.trim()) {
          return 'URL is required';
        }
        try {
          new URL(input.trim());
          return true;
        } catch {
          return 'Please enter a valid URL';
        }
      }
    }
  ]);

  let recommenderName = '';
  if (urlType.type === 'specific') {
    const namePrompt = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Enter the name of the recommender:',
        validate: (input) => {
          if (!input.trim()) {
            return 'Name is required';
          }
          return true;
        }
      }
    ]);
    recommenderName = namePrompt.name.trim();
  }

  return {
    urlType: urlType.type,
    url: urlPrompt.url.trim(),
    recommenderName
  };
}

export async function findSocialUrl(page: Stagehand['page'], personName: string): Promise<string | null> {
  console.log(chalk.blue(`\nFinding social URL for: ${personName}`));
  
  // First try Twitter
  await page.goto('https://www.google.com');
  const twitterQuery = `${personName} twitter profile`;
  
  await page.act(`Type '${twitterQuery}' into the search input`);
  await page.act('Press Enter');

  // Set timeout for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { links: twitterLinks } = await page.extract({
    instruction: "Extract the first link that contains 'twitter' or 'x'. Make sure it is a valid URL.",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  if (twitterLinks[0]) {
    console.log(chalk.cyan(`\nFound Twitter profile: ${twitterLinks[0]}`));
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Is this the correct Twitter profile?'
      }
    ]);
    
    if (confirm) return twitterLinks[0];
  }

  // Try Wikipedia if Twitter wasn't found or was rejected
  await page.goto('https://www.google.com');
  const wikiQuery = `${personName} wikipedia`;
  
  await page.act(`Type '${wikiQuery}' into the search input`);
  await page.act('Press Enter');
  // set timeout for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { links: wikiLinks } = await page.extract({
    instruction: "Extract the first link that contains 'wikipedia'. Make sure it is a valid URL.",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  if (wikiLinks[0]) {
    console.log(chalk.cyan(`\nFound Wikipedia page: ${wikiLinks[0]}`));
    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Is this the correct Wikipedia page?'
      }
    ]);
    
    if (confirm) return wikiLinks[0];
  }

  return null;
}

async function extractBookRecommendations(page: Page, personName: string) {
  const { books } = await page.extract({
    instruction: `Look for a list or collection of book recommendations on the page. For each book found:
      1. The title should be a proper book title
      2. The author should be the actual writer of the book (not ${personName})
      3. Skip items without both title and author
      4. Skip items where the author name matches ${personName}`,
    schema: z.object({
      books: z.array(z.object({
        title: z.string(),
        author: z.string(),
      }))
    }),
    useTextExtract: true
  });
  return books;
}

async function extractRecommendersList(page: Page) {
    const { recommenders } = await page.extract({
      instruction: "Find all book recommenders listed on the page. Get their names only.",
      schema: z.object({
        recommenders: z.array(z.object({
          name: z.string()
        }))
      }),
      useTextExtract: true
    });
  return recommenders;
}

async function navigateToRecommenderProfile(page: Page, recommenderName: string): Promise<string> {
  await page.act(`Click on ${recommenderName}'s profile or name`);
  return page.url();
}

async function findOrCreatePerson(personName: string, url: string | null) {
  const { data: existingPerson, error: personQueryError } = await supabase
    .from('people')
    .select('id')
    .eq('full_name', personName)
    .single();

  if (personQueryError && personQueryError.code !== 'PGRST116') {
    throw new Error(`Error finding person "${personName}": ${personQueryError.message}`);
  }

  if (existingPerson) {
    console.log(chalk.green(`Found existing entry for ${personName}`));
    return existingPerson.id;
  }

  const newPersonId = uuidv4();
  const { error: personInsertError } = await supabase
    .from('people')
    .insert({
      id: newPersonId,
      full_name: personName,
      url,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (personInsertError) {
    throw new Error(`Error creating person "${personName}": ${personInsertError.message}`);
  }

  console.log(chalk.green(`Created new entry for ${personName}`));
  return newPersonId;
}

async function checkExistingPerson(personName: string) {
  const { data: existingPerson, error: personQueryError } = await supabase
    .from('people')
    .select('id')
    .eq('full_name', personName)
    .single();

  if (personQueryError && personQueryError.code !== 'PGRST116') {
    throw new Error(`Error finding person "${personName}": ${personQueryError.message}`);
  }

  return existingPerson?.id;
}

export async function findAmazonUrl(page: Stagehand['page'], title: string, author: string) {
  await page.goto('https://www.google.com');
  
  // Search for book on Google
  const searchQuery = `${title} ${author} amazon`;
  await page.act("Type '" + searchQuery + "' into the search input");
  await page.act("Press Enter");

  // Set timeout for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Extract the first Amazon link with proper URL
  const { amazonUrl } = await page.extract({
    instruction: "Extract the href attribute of the first link that contains 'amazon.com' in its URL. Make sure it is a valid URL.",
    schema: z.object({
      amazonUrl: z.string()
    }),
    useTextExtract: false
  });

  return amazonUrl || null;
}

async function findOrCreateBook(page: Page, book: { title: string, author: string }) {
  // Check for similar books using pg_trgm
  console.log(chalk.blue("Checking for similar books:"), chalk.gray(`"${book.title}" by ${book.author}`));
  
  const { data: similarBooks, error: similarBooksError } = await supabase
    .rpc('find_similar_books', {
      p_title: getBasicTitle(book.title.trim()),
      p_author: cleanAuthorName(book.author)
    });

  if (similarBooksError) {
    console.error(chalk.red("Similar books check failed:"), similarBooksError);
    throw new Error(`Error checking for similar books: ${similarBooksError.message}`);
  }

  if (similarBooks && similarBooks.length > 0) {
    const similarBook = similarBooks[0];
    console.log(chalk.yellow(`Found similar book: "${similarBook.title}" by ${similarBook.author}`));
    console.log(chalk.gray(`Title similarity: ${(similarBook.title_similarity * 100).toFixed(1)}%`));
    console.log(chalk.gray(`Author similarity: ${(similarBook.author_similarity * 100).toFixed(1)}%`));
    return similarBook.id;
  }

  // If no similar matches found, proceed with creating the new book
  const { genre, description } = await generateGenreAndDescription(
    toTitleCase(book.title.trim()),
    cleanAuthorName(book.author)
  );

  console.log(chalk.blue('Finding Amazon URL...'));
  const amazonUrl = await findAmazonUrl(page, book.title, book.author);
  console.log(amazonUrl ? chalk.green('Found Amazon URL') : chalk.yellow('No Amazon URL found'));

  const bookId = uuidv4();
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
    throw new Error(`Error inserting book "${book.title}": ${bookInsertError.message}`);
  }

  return bookId;
}

async function createRecommendation(bookId: string, personId: string, source: string, sourceLink: string) {
  const { data: existingRec, error: recSearchError } = await supabase
    .from('recommendations')
    .select('id')
    .eq('book_id', bookId)
    .eq('person_id', personId)
    .eq('source', source)
    .single();

  if (recSearchError && recSearchError.code !== 'PGRST116') {
    throw new Error(`Error searching for recommendation: ${recSearchError.message}`);
  }

  if (existingRec) {
    console.log(chalk.blue(`Recommendation already exists`));
    return;
  }

  const { error: recError } = await supabase
    .from('recommendations')
    .insert({
      id: uuidv4(),
      book_id: bookId,
      person_id: personId,
      source,
      source_link: sourceLink,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (recError) {
    throw new Error(`Error creating recommendation: ${recError.message}`);
  }
}

export async function generateGenreAndDescription(title: string, author: string) {
  const result = await invoke({
    projectName: "booklist",
    slug: "genre-and-description-0680",
    input: { title, author },
    schema: z.object({
      genre: z.array(z.string()),
      description: z.string()
    }),
  });
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
  try {
    // Set realistic user agent
    await context.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    });

    // Get URL and type information
    const { urlType, url, recommenderName } = await promptUser();
    console.log(chalk.green("Going to URL:"), url);
    await page.goto(url);

    if (urlType === 'collection') {
      // Original flow for collection of recommenders
      console.log(chalk.blue("Extracting recommenders list..."));
      const recommenders = await extractRecommendersList(page);

      if (!recommenders || recommenders.length === 0) {
        console.log(chalk.yellow("No recommenders found on the main page."));
        return;
      }

      console.log(chalk.green(`Found ${recommenders.length} recommenders`));
      
      // Check which recommenders are already in the database
      console.log(chalk.blue("\nChecking existing recommenders in database..."));
      const recommenderStatus = await Promise.all(
        recommenders.map(async (recommender) => {
          const existingId = await checkExistingPerson(recommender.name);
          return {
            ...recommender,
            exists: !!existingId,
            id: existingId
          };
        })
      );

      // Log the plan
      console.log(chalk.blue("\nProcessing plan:"));
      recommenderStatus.forEach(recommender => {
        if (recommender.exists) {
          console.log(chalk.yellow(`- ${recommender.name} (already in database)`));
        } else {
          console.log(chalk.green(`- ${recommender.name} (will process)`));
        }
      });

      // Process each recommender
      for (const recommender of recommenderStatus) {
        try {
          console.log(chalk.blue("\nFound recommender:"), chalk.white(recommender.name));
          
          // If recommender already exists, skip unless user wants to update
          if (recommender.exists) {
            console.log(chalk.yellow(`${recommender.name} is already in database`));
            continue;
          }

          // Ask user if they want to process this recommender
          const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const shouldProcess = await new Promise<boolean>((resolve) => {
            rl.question(chalk.yellow(`\nDo you want to process ${recommender.name}? (y/n): `), (answer) => {
              rl.close();
              resolve(answer.toLowerCase() === 'y');
            });
          });

          if (!shouldProcess) {
            console.log(chalk.yellow(`Skipping ${recommender.name} by user request`));
            continue;
          }
          
          // Navigate to recommender's profile by clicking their name
          console.log(chalk.blue("Navigating to recommender's profile..."));
          const currentUrl = await navigateToRecommenderProfile(page, recommender.name);
          
          await processRecommender(page, recommender.name, currentUrl, url);
        } catch (error) {
          console.error(chalk.red(`Error processing recommender "${recommender.name}":`));
          console.error(error);
          // Try to go back to main page before continuing
          await page.goto(url);
          continue;
        }
      }
    } else {
      // Flow for specific recommender
      try {
        const currentUrl = page.url();
        await processRecommender(page, recommenderName, currentUrl, currentUrl);
      } catch (error) {
        console.error(chalk.red(`Error processing recommender "${recommenderName}":`));
        console.error(error);
      }
    }

  } catch (error) {
    console.error(chalk.red("Error occurred:"));
    console.error(error);
    process.exit(1);
  }
}

async function processRecommender(page: Page, recommenderName: string, currentUrl: string, returnUrl: string) {
  // Extract source information
  const sourceName = getSourceName(currentUrl);
  console.log(chalk.blue("Source:"), sourceName);

  // Find social URL (Twitter or Wikipedia)
  console.log(chalk.blue("Finding social URL..."));
  const socialUrl = await findSocialUrl(page, recommenderName);

  // Go back to recommender's profile
  await page.goto(currentUrl);

  // Extract book recommendations
  console.log(chalk.blue("Extracting book recommendations..."));
  const books = await extractBookRecommendations(page, recommenderName);

  if (!books || books.length === 0) {
    console.log(chalk.yellow("No book recommendations found for this recommender."));
    // Go back to return URL before continuing to next recommender
    await page.goto(returnUrl);
    return;
  }

  // Create/find person record
  console.log(chalk.blue("Processing recommender information..."));
  const personId = await findOrCreatePerson(recommenderName, socialUrl);

  // Process books and create recommendations
  console.log(chalk.green("\nProcessing books..."));
  for (const book of books) {
    try {
      console.log(chalk.blue("\nProcessing:"), chalk.white(book.title));
      
      const bookId = await findOrCreateBook(page, book);
      await createRecommendation(bookId, personId, sourceName, currentUrl);
      
      console.log(chalk.green(`✓ Successfully processed "${book.title}"`));
    } catch (error) {
      console.error(chalk.red(`Error processing "${book.title}":`), error);
      continue;
    }
  }

  console.log(chalk.green(`\nTotal books processed for ${recommenderName}: ${books.length}`));

  // Go back to return URL before continuing to next recommender
  await page.goto(returnUrl);
}
