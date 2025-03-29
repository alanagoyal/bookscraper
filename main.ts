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
import { v4 as uuidv4 } from "uuid";
import inquirer from "inquirer";
import { supabase } from "./src/services/supabase.ts";
import { sanitizeTitle } from "./src/utils/title.ts";
import { categorizePerson } from "./src/utils/person.ts";
import { findAmazonUrl } from "./src/utils/amazon.ts";
import { generateGenreAndDescription } from "./src/utils/genre-and-description.ts";
import { createBookEmbeddings } from "./src/utils/embeddings.ts";
import { findSocialUrl } from "./src/utils/social.ts";

// Helper Functions
function stripUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname
      .replace(/^www\./, "")
      .replace(/\.(com|org|net|edu|gov|io)$/, "")
      .split(".")
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");
  } catch (e) {
    return url;
  }
}

export function getSourceName(url: string): string {
  const sourceNameOriginal = stripUrl(url);
  return sourceNameOriginal === "Kevinrooke"
    ? "Bookmarked"
    : sourceNameOriginal;
}

async function checkExistingPerson(personName: string) {
  const { data: existingPerson, error: personQueryError } = await supabase
    .from("people")
    .select("id")
    .eq("full_name", personName)
    .single();

  if (personQueryError && personQueryError.code !== "PGRST116") {
    throw new Error(
      `Error finding person "${personName}": ${personQueryError.message}`
    );
  }

  return existingPerson?.id;
}

// Get user input
async function promptUser() {
  const urlType = await inquirer.prompt([
    {
      type: "list",
      name: "type",
      message: "What type of URL do you have?",
      choices: [
        { name: "Recommender list", value: "collection" },
        { name: "One recommender", value: "specific" },
        { name: "Multiple recommenders", value: "multiple" },
      ],
    },
  ]);

  const urlPrompt = await inquirer.prompt([
    {
      type: "input",
      name: "url",
      message:
        urlType.type === "collection"
          ? "Enter the URL of the main book recommenders page:"
          : urlType.type === "multiple"
          ? "Enter the URL of the page with multiple recommenders:"
          : "Enter the URL of the specific recommender page:",
      validate: (input) => {
        if (!input.trim()) {
          return "URL is required";
        }
        try {
          new URL(input.trim());
          return true;
        } catch {
          return "Please enter a valid URL";
        }
      },
    },
  ]);

  let recommenderName = "";
  if (urlType.type === "specific") {
    const namePrompt = await inquirer.prompt([
      {
        type: "input",
        name: "name",
        message: "Enter the name of the recommender:",
        validate: (input) => {
          if (!input.trim()) {
            return "Name is required";
          }
          return true;
        },
      },
    ]);
    recommenderName = namePrompt.name.trim();
  }

  return {
    urlType: urlType.type,
    url: urlPrompt.url.trim(),
    recommenderName,
  };
}

// Extract book recommendations from the page
async function extractBookRecommendations(page: Page, personName?: string) {
  const instruction = personName
    ? `Look for a list or collection of book recommendations on the page. For each book found:
      1. The title should be a proper book title
      2. The author should be the actual writer of the book (not ${personName})
      3. Skip items without both title and author
      4. Skip items where the author name matches ${personName}`
    : `Get all book recommendations on the page including the person who recommended them, title, and author. For each recommendation:
      1. The recommender should be the person who recommended the book
      2. The title should be a proper book title
      3. The author should be the actual writer of the book
      4. Skip items without recommender, title, and author`;

  type SingleRecommenderResult = {
    books: Array<{ title: string; author: string }>;
  };

  type MultipleRecommenderResult = {
    recommendations: Array<{
      recommender: string;
      title: string;
      author: string;
    }>;
  };

  const schema = personName
    ? z.object({
        books: z.array(
          z.object({
            title: z.string(),
            author: z.string(),
          })
        ),
      })
    : z.object({
        recommendations: z.array(
          z.object({
            recommender: z.string(),
            title: z.string(),
            author: z.string(),
          })
        ),
      });

  const result = await page.extract({
    instruction,
    schema,
    useTextExtract: true,
  }) as SingleRecommenderResult | MultipleRecommenderResult;

  return personName
    ? (result as SingleRecommenderResult).books
    : (result as MultipleRecommenderResult).recommendations;
}

// Extract list of recommenders from the page for each category
async function extractRecommendersList(page: Page, category: string) {
  console.log(chalk.blue(`Extracting recommenders for category: ${category}...`));
  
  // Cache the observe results for finding the category section
  const categoryResults = await page.observe(`Find the section for category "${category}"`);
  
  // Extract recommenders under this category heading
  const { recommenders } = await page.extract({
    instruction: `Extract all expert names listed under the heading "${category}". Get their names only.`,
    schema: z.object({
      recommenders: z.array(
        z.object({
          name: z.string(),
        })
      ),
    }),
    useTextExtract: false, // Use HTML parsing instead of text extraction
  });

  // Add category information and cached observe results to each recommender
  const recommendersWithCategory = recommenders.map(r => ({
    ...r,
    category,
    categoryResults
  }));

  return recommendersWithCategory;
}

// Navigate to the recommender's profile
async function navigateToRecommenderProfile(
  page: Page,
  recommenderName: string,
  categoryResults: any
): Promise<string> {
  // First observe to find the specific category section using cached results
  await page.act(categoryResults[0]);
  
  // Then click the specific name within that section
  const nameResults = await page.observe({
    instruction: `Click on ${recommenderName}'s profile or name within the current section`,
    onlyVisible: true // Ensure we only target visible elements in the current section
  });
  
  await page.act(nameResults[0]);
  return page.url();
}

// Find or create a person in the database
async function findOrCreatePerson(personName: string, page: Page) {
  const existingPersonId = await checkExistingPerson(personName);

  if (existingPersonId) {
    console.log(chalk.green(`Found existing entry for ${personName}`));
    return existingPersonId;
  }

  const { type } = await categorizePerson(personName);
  console.log(chalk.blue(`Categorized ${personName} as: ${type}`));

  // Find social URL before creating person
  const socialUrl = await findSocialUrl(page, personName, type);
  console.log(chalk.blue(`Found social URL for ${personName}: ${socialUrl || null}`));

  const newPersonId = uuidv4();
  const { error: personInsertError } = await supabase.from("people").insert({
    id: newPersonId,
    full_name: personName,
    type,
    url: socialUrl,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (personInsertError) {
    throw new Error(
      `Error creating person "${personName}": ${personInsertError.message}`
    );
  }

  console.log(chalk.green(`Created new entry for ${personName}`));
  return newPersonId;
}

async function findOrCreateBook(
  page: Page,
  book: { title: string; author: string }
) {
  // First check for exact match
  const { data: exactMatch, error: exactMatchError } = await supabase
    .from("books")
    .select("id")
    .eq("title", book.title)
    .eq("author", book.author)
    .single();

  if (exactMatchError && exactMatchError.code !== "PGRST116") {
    console.error(chalk.red("Exact match check failed:"), exactMatchError);
    throw new Error(
      `Error checking for exact book match: ${exactMatchError.message}`
    );
  }

  if (exactMatch) {
    console.log(
      chalk.yellow(
        `Found exact match for book: "${book.title}" by ${book.author}`
      )
    );
    return exactMatch.id;
  }

  // If no exact match, check for similar books using embeddings
  console.log(
    chalk.blue("Checking for similar books:"),
    chalk.gray(`"${book.title}" by ${book.author}`)
  );

  const response = await createBookEmbeddings(book.title, book.author, "");

  if (!response) {
    console.error(chalk.red("Embedding creation failed"));
    throw new Error("Error creating embeddings");
  }

  const { data: similarBooks, error: similarBooksError } = await supabase.rpc(
    "get_best_matching_book",
    {
      p_title_embedding: response.title_embedding,
      p_author_embedding: response.author_embedding,
    }
  );

  if (similarBooksError) {
    console.error(chalk.red("Similar books check failed:"), similarBooksError);
    throw new Error(
      `Error checking for similar books: ${similarBooksError.message}`
    );
  }

  if (similarBooks && similarBooks.length > 0) {
    const similarBook = similarBooks[0];
    console.log(
      chalk.yellow(
        `Found similar book: "${similarBook.title}" by ${similarBook.author}`
      )
    );
    console.log(
      chalk.gray(
        `Title similarity: ${(similarBook.title_similarity * 100).toFixed(1)}%`
      )
    );
    console.log(
      chalk.gray(
        `Author similarity: ${(similarBook.author_similarity * 100).toFixed(
          1
        )}%`
      )
    );
    return similarBook.id;
  }

  // If no similar matches found, proceed with creating the new book
  const { genre, description } = await generateGenreAndDescription(
    book.title,
    book.author
  );

  console.log(chalk.blue("Finding Amazon URL..."));
  const amazonUrl = await findAmazonUrl(page, book.title, book.author);
  console.log(
    amazonUrl
      ? chalk.green("Found Amazon URL")
      : chalk.yellow("No Amazon URL found")
  );

  // Create embeddings for the new book
  console.log(chalk.blue("Creating embeddings..."));
  const embeddings = await createBookEmbeddings(
    book.title,
    book.author,
    description
  );
  console.log(chalk.green("Embeddings created"));

  const bookId = uuidv4();
  const { data: newBook, error: createError } = await supabase
    .from("books")
    .insert({
      id: bookId,
      title: book.title,
      author: book.author,
      genre,
      description,
      amazon_url: amazonUrl,
      ...embeddings,
    })
    .select()
    .single();

  if (createError) {
    throw new Error(
      `Error inserting book "${book.title}": ${createError.message}`
    );
  }

  return newBook.id;
}

async function createRecommendation(
  bookId: string,
  personId: string,
  source: string,
  sourceLink: string
) {
  const { data: existingRec, error: recSearchError } = await supabase
    .from("recommendations")
    .select("id")
    .eq("book_id", bookId)
    .eq("person_id", personId)
    .single();

  if (recSearchError && recSearchError.code !== "PGRST116") {
    throw new Error(
      `Error searching for recommendation: ${recSearchError.message}`
    );
  }

  if (existingRec) {
    console.log(
      chalk.yellow(
        `Skipping: Recommendation already exists for this book and person`
      )
    );
    return;
  }

  const { error: recError } = await supabase.from("recommendations").insert({
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
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    });

    // Get URL and type information
    const { urlType, url, recommenderName } = await promptUser();
    console.log(chalk.green("Going to URL:"), url);
    await page.goto(url);

    if (urlType === "collection") {
      // Original flow for collection of recommenders
      console.log(chalk.blue("Processing recommenders by category..."));

      // Process each category
      const categories = [
        "Novelists",
        "Painters",
        "Philosophers",
        "Photographers",
        "Physicists",
        "Poets",
        "Policemen",
        "Policy Analysts",
        "Political Commentators",
        "Political Scientists",
        "Politicians",
        "Psychologists",
        "Publishers",
        "Science Writers",
        "Scientists",
        "Short Story Writers",
        "Social Scientists",
        "Sociologists",
        "Sportspersons & Sportswriters",
        "Teachers",
        "Technologists",
        "Theatre Critics",
        "Theologians & Historians of Religion",
        "Thriller and Crime Writers",
        "Translators",
        "Travel Writers",
      ];

      for (const category of categories) {
        console.log(chalk.green(`\n=== Processing Category: ${category} ===`));
        
        // Extract recommenders for this category
        const recommenders = await extractRecommendersList(page, category);

        if (!recommenders || recommenders.length === 0) {
          console.log(chalk.yellow(`No recommenders found for category: ${category}`));
          continue;
        }

        console.log(chalk.green(`Found ${recommenders.length} recommenders in this category`));

        // Check which recommenders are already in the database
        console.log(
          chalk.blue("\nChecking existing recommenders in database...")
        );
        const recommenderStatus = await Promise.all(
          recommenders.map(async (recommender) => {
            const existingId = await checkExistingPerson(recommender.name);
            return {
              name: recommender.name,
              exists: !!existingId,
              id: existingId,
              category: recommender.category,
              categoryResults: recommender.categoryResults
            };
          })
        );

        // Log the plan for this category
        console.log(chalk.blue("\nProcessing plan for this category:"));
        recommenderStatus.forEach((recommender) => {
          if (recommender.exists) {
            console.log(
              chalk.yellow(`- ${recommender.name} (already in database)`)
            );
          } else {
            console.log(chalk.green(`- ${recommender.name} (will process)`));
          }
        });

        // Process each recommender in this category
        for (const recommender of recommenderStatus) {
          try {
            console.log(
              chalk.blue("\nFound recommender:"),
              chalk.white(recommender.name)
            );

            // Skip existing recommenders
            if (recommender.exists) {
              console.log(
                chalk.yellow(`Skipping ${recommender.name} (already in database)`)
              );
              continue;
            }

            // Automatically process new recommenders
            console.log(
              chalk.green(`Processing ${recommender.name} (new recommender)`)
            );

            // Navigate to recommender's profile by clicking their name
            console.log(chalk.blue("Navigating to recommender's profile..."));
            const currentUrl = await navigateToRecommenderProfile(
              page,
              recommender.name,
              recommender.categoryResults
            );

            await processRecommender(page, recommender.name, currentUrl, url);
          } catch (error) {
            console.error(
              chalk.red(`Error processing recommender "${recommender.name}":`)
            );
            console.error(error);
            // Try to go back to main page before continuing
            await page.goto(url);
            continue;
          }
        }

        console.log(chalk.green(`\n✓ Completed processing category: ${category}`));
      }
    } else if (urlType === "multiple") {
      // New flow for multiple recommenders
      console.log(chalk.blue("Extracting book recommendations..."));
      type MultipleRecommendation = {
        recommender: string;
        title: string;
        author: string;
      };
      const recommendations = (await extractBookRecommendations(page)) as MultipleRecommendation[];

      if (!recommendations || recommendations.length === 0) {
        console.log(
          chalk.yellow("No book recommendations found for this page.")
        );
        return;
      }

      console.log(chalk.green(`Found ${recommendations.length} recommendations`));

      // Process recommendations
      console.log(chalk.green("\nProcessing recommendations..."));
      for (const recommendation of recommendations) {
        try {
          console.log(
            chalk.blue("\nProcessing recommendation by:"),
            chalk.white(recommendation.recommender)
          );

          const recommenderName = recommendation.recommender;
          const book = {
            title: recommendation.title,
            author: recommendation.author,
          };

          // Create/find person record
          console.log(chalk.blue("Processing recommender information..."));
          const personId = await findOrCreatePerson(recommenderName, page);

          // Create/find book record
          const bookId = await findOrCreateBook(page, book);

          // Create recommendation
          await createRecommendation(
            bookId,
            personId,
            getSourceName(url),
            url
          );

          console.log(
            chalk.green(`✓ Successfully processed recommendation by ${recommenderName}`)
          );
        } catch (error) {
          console.error(
            chalk.red(`Error processing recommendation by ${recommendation.recommender}:`),
            error
          );
          continue;
        }
      }

      console.log(
        chalk.green(
          `\nTotal recommendations processed for this page: ${recommendations.length}`
        )
      );
    } else {
      // Flow for specific recommender
      try {
        const currentUrl = page.url();
        await processRecommender(page, recommenderName, currentUrl, currentUrl);
      } catch (error) {
        console.error(
          chalk.red(`Error processing recommender "${recommenderName}":`)
        );
        console.error(error);
      }
    }
  } catch (error) {
    console.error(chalk.red("Error occurred:"));
    console.error(error);
    process.exit(1);
  }
}

async function processRecommender(
  page: Page,
  recommenderName: string,
  currentUrl: string,
  returnUrl: string
) {
  // Extract source information
  const sourceName = getSourceName(currentUrl);
  console.log(chalk.blue("Source:"), sourceName);

  // Extract book recommendations
  console.log(chalk.blue("Extracting book recommendations..."));
  const books = await extractBookRecommendations(page, recommenderName);

  if (!books || books.length === 0) {
    console.log(
      chalk.yellow("No book recommendations found for this recommender.")
    );
    // Go back to return URL before continuing to next recommender
    await page.goto(returnUrl);
    return;
  }

  // Create/find person record
  console.log(chalk.blue("Processing recommender information..."));
  const personId = await findOrCreatePerson(recommenderName, page);

  // Process books and create recommendations
  console.log(chalk.green("\nProcessing books..."));
  for (const book of books) {
    try {
      console.log(chalk.blue("\nProcessing:"), chalk.white(book.title));

      const sanitizedTitle = await sanitizeTitle(book.title.trim());
      const cleanedAuthor = book.author;
      const bookId = await findOrCreateBook(page, {
        title: sanitizedTitle.title,
        author: cleanedAuthor,
      });
      await createRecommendation(bookId, personId, sourceName, currentUrl);

      console.log(chalk.green(`✓ Successfully processed "${book.title}"`));
    } catch (error) {
      console.error(chalk.red(`Error processing "${book.title}":`), error);
      continue;
    }
  }

  console.log(
    chalk.green(
      `\nTotal books processed for ${recommenderName}: ${books.length}`
    )
  );

  // Go back to return URL before continuing to next recommender
  await page.goto(returnUrl);
}
