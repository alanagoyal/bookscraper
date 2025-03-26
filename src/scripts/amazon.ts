import chalk from 'chalk';
import StagehandConfig from "../../stagehand.config.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { supabase } from '../services/supabase.ts';
import { findAmazonUrl } from '../utils/amazon.ts';

async function getBooks() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, author, amazon_url')
    .is('amazon_url', null);
  
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

// To run: npx tsx amazon.ts
async function run() {
  const stagehand = new Stagehand({
    ...StagehandConfig,
  });
  await stagehand.init();

  const page = stagehand.page;

  try {
    const books = await getBooks();
    console.log(chalk.blue(`Found ${books.length} books without Amazon URLs between Mar 6-7, 2025`));
    
    // Print all book titles first
    console.log(chalk.cyan('\nBooks to process:'));
    books.forEach((book, index) => {
      console.log(chalk.cyan(`${index + 1}. ${book.title} by ${book.author}`));
    });
    console.log(); // Empty line for better readability

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
