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

interface SocialLinks {
  twitter_url?: string;
  wiki_url?: string;
  website_url?: string;
}

// Core Functions
async function promptUser() {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'mainUrl',
      message: 'Enter the URL of the main book recommenders page:',
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

  return {
    mainUrl: answers.mainUrl.trim()
  };
}

async function extractSocialLinks(page: Page): Promise<SocialLinks> {
  const { links } = await page.extract({
    instruction: "Find the URLs from the X Profile and Wikipedia buttons/links in the profile section",
    schema: z.object({
      links: z.array(z.object({
        text: z.string(),
        url: z.string()
      }))
    }),
    useTextExtract: false  // Set false since we're extracting small pieces of data (URLs)
  });

  const socialLinks: SocialLinks = {};

  for (const link of links) {
    if (link.text.toLowerCase().includes('x profile') || link.text.toLowerCase().includes('twitter')) {
      socialLinks.twitter_url = link.url;
    } else if (link.text.toLowerCase().includes('wikipedia')) {
      socialLinks.wiki_url = link.url;
    }
  }

  return socialLinks;
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

async function findOrCreatePerson(personName: string, socialLinks: SocialLinks) {
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
      twitter_url: socialLinks.twitter_url,
      wiki_url: socialLinks.wiki_url,
      website_url: socialLinks.website_url,
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

async function findAmazonUrlOnPage(page: Page, book: { title: string, author: string }): Promise<string | null> {
  try {
    // First try to extract any Amazon links directly
    const { links } = await page.extract({
      instruction: `Find any Amazon purchase links for the book "${book.title}" by ${book.author}. Only return links that go to Amazon.com.`,
      schema: z.object({
        links: z.array(z.string())
      }),
      useTextExtract: false
    });

    if (links && links.length > 0) {
      return links[0];
    }

    // If no direct links found, try to find and click a link that might lead to purchase options
    const results = await page.observe({
      instruction: `Find and click a link or button that would take you to purchase "${book.title}" by ${book.author}, preferably on Amazon`,
      onlyVisible: false,
      returnAction: true
    });

    if (results && results.length > 0) {
      await page.act(results[0]);
      
      // Check if we landed on an Amazon page
      const currentUrl = page.url();
      if (currentUrl.includes('amazon.com')) {
        return currentUrl;
      }
      
      // If not on Amazon, try to find an Amazon link on this new page
      const { links: newLinks } = await page.extract({
        instruction: "Find any Amazon.com purchase links on this page",
        schema: z.object({
          links: z.array(z.string())
        }),
        useTextExtract: false
      });
      
      // Go back to the original page
      await page.goBack();
      
      if (newLinks && newLinks.length > 0) {
        return newLinks[0];
      }
    }

    return null;
  } catch (error) {
    console.log(chalk.yellow(`Could not find Amazon link for "${book.title}"`));
    return null;
  }
}

async function findOrCreateBook(page: Page, book: { title: string, author: string }) {
  // Check for similar books using pg_trgm
  console.log(chalk.blue("Checking for similar books:"), chalk.gray(`"${book.title}" by ${book.author}`));
  
  const { data: similarBooks, error: similarBooksError } = await supabase
    .rpc('find_similar_books', {
      p_title: book.title.trim(),
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
  const amazonUrl = await findAmazonUrlOnPage(page, book);
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

    // Get main recommenders page URL
    const { mainUrl } = await promptUser();
    console.log(chalk.green("Going to main URL:"), mainUrl);
    await page.goto(mainUrl);

    // Extract all recommenders first and check existing entries
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
        console.log(chalk.blue("\nProcessing recommender:"), chalk.white(recommender.name));
        
        // If recommender already exists, skip unless user wants to update
        if (recommender.exists) {
          console.log(chalk.yellow(`Skipping ${recommender.name} - already in database`));
          continue;
        }
        
        // Navigate to recommender's profile by clicking their name
        console.log(chalk.blue("Navigating to recommender's profile..."));
        const currentUrl = await navigateToRecommenderProfile(page, recommender.name);
        
        // Extract source information
        const sourceName = getSourceName(currentUrl);
        console.log(chalk.blue("Source:"), sourceName);

        // Extract social links
        console.log(chalk.blue("Extracting social links..."));
        const socialLinks = await extractSocialLinks(page);

        // Extract book recommendations
        console.log(chalk.blue("Extracting book recommendations..."));
        const books = await extractBookRecommendations(page, recommender.name);

        if (!books || books.length === 0) {
          console.log(chalk.yellow("No book recommendations found for this recommender."));
          // Go back to main page before continuing to next recommender
          await page.goto(mainUrl);
          continue;
        }

        // Create/find person record
        console.log(chalk.blue("Processing recommender information..."));
        const personId = await findOrCreatePerson(recommender.name, socialLinks);

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

        console.log(chalk.green(`\nTotal books processed for ${recommender.name}: ${books.length}`));

        // Go back to main page before continuing to next recommender
        await page.goto(mainUrl);

      } catch (error) {
        console.error(chalk.red(`Error processing recommender "${recommender.name}":`));
        console.error(error);
        // Try to go back to main page before continuing
        await page.goto(mainUrl);
        continue;
      }
    }

  } catch (error) {
    console.error(chalk.red("Error occurred:"));
    console.error(error);
    process.exit(1);
  }
}
