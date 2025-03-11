import { Stagehand } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';
import chalk from 'chalk';

dotenv.config();

// To run: npx tsx amazon-links.ts

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getBooks() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, author')
    .gte('created_at', '2025-03-07T18:53:53.916Z')
    .lte('created_at', '2025-03-10T18:15:56.615Z');
  
  if (error) throw error;
  return books;
}

async function updateBookAmazonUrl(id: string, amazonUrl: string) {
  console.log(chalk.blue('Attempting to update database with:'), {
    id,
    amazonUrl,
  });

  // First verify we can read from the database
  const { data: book, error: readError } = await supabase
    .from('books')
    .select('title, author')
    .eq('id', id)
    .single();

  if (readError) {
    console.error(chalk.red('Error reading from database:'), readError);
    throw readError;
  }

  console.log(chalk.blue('Found book:'), book);

  // Now try to update
  const { error: updateError } = await supabase
    .from('books')
    .update({ amazon_url: amazonUrl })
    .eq('id', id);
  
  if (updateError) {
    console.error(chalk.red('Database update error:'), updateError);
    throw updateError;
  }
  
  // Verify the update
  const { data: updatedBook, error: verifyError } = await supabase
    .from('books')
    .select('title, author, amazon_url')
    .eq('id', id)
    .single();
    
  if (verifyError) {
    console.error(chalk.red('Verification error:'), verifyError);
  } else {
    console.log(chalk.blue('Updated book:'), updatedBook);
  }
}

async function findAmazonUrl(page: any, title: string, author: string) {
  await page.goto('https://www.google.com');
  
  // Search for book on Google
  const searchQuery = `${title} ${author} amazon`;
  await page.act("Type '" + searchQuery + "' into the search input");
  await page.act("Press Enter");

  // Extract the first Amazon link
  const { links } = await page.extract({
    instruction: "Extract the first link that contains 'amazon.com'",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  return links[0] || null;
}

async function run() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
  });
  await stagehand.init();

  const page = stagehand.page;

  try {
    const books = await getBooks();
    console.log(chalk.blue(`Found ${books.length} books between Mar 7-10, 2025`));

    for (const book of books) {
      console.log(chalk.yellow(`Processing: ${book.title} by ${book.author}`));
      
      try {
        const amazonUrl = await findAmazonUrl(page, book.title, book.author);
        
        if (amazonUrl) {
          await updateBookAmazonUrl(book.id, amazonUrl);
          console.log(chalk.green(`✓ Updated Amazon URL for: ${book.title}`));
        } else {
          console.log(chalk.red(`No Amazon URL found for: ${book.title}`));
        }
      } catch (error) {
        console.error(chalk.red(`Error processing ${book.title}:`), error);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) {
    console.error(chalk.red('Error:'), error);
  } finally {
    await stagehand.close();
  }
}

run().catch(console.error);
