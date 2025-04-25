// To run: npx tsx genre.ts
import { supabase } from '../services/supabase.ts';
import chalk from 'chalk';
import { STANDARD_GENRES } from '../utils/genre-and-description.ts';

type StandardGenre = typeof STANDARD_GENRES[number];

async function sanitizeGenre() {
  console.log(chalk.blue('Starting genre sanitization...'));

  // Get all books
  const { data: books, error } = await supabase
    .from('books')
    .select('id, title, author, genre');

  if (error) {
    console.error(chalk.red('Error fetching records:', error.message));
    throw error;
  }

  if (!books || books.length === 0) {
    console.log(chalk.yellow('No books found.'));
    return;
  }

  // Filter books with multiple genres or non-standard genres
  const booksToUpdate = books.filter(book => 
    book.genre.length > 1 || book.genre.some((g: string) => !STANDARD_GENRES.includes(g as StandardGenre))
  );

  console.log(chalk.blue(`Found ${booksToUpdate.length} books with multiple or non-standard genres to process.`));

  // Process each book
  for (const book of booksToUpdate) {
    console.log(chalk.cyan(`Processing ${book.title}:`));
    console.log(chalk.gray(`  Current genres: ${book.genre.join(', ')}`));
    
    // Take only the first genre if it's standard, otherwise use 'Misc'
    const firstGenre = book.genre[0];
    const newGenre = [STANDARD_GENRES.includes(firstGenre as StandardGenre) ? firstGenre : 'Misc'];

    console.log(chalk.green(`  New genre: ${newGenre[0]}`));

    const { error: updateError } = await supabase
      .from('books')
      .update({ genre: newGenre })
      .eq('id', book.id);

    if (updateError) {
      console.error(chalk.red(`Error updating ${book.title}:`, updateError.message));
    } else {
      console.log(chalk.green(`  Successfully updated genres for ${book.title}`));
    }
  }

  console.log(chalk.green('\nGenre sanitization complete!'));
}

// Run the script
sanitizeGenre().catch(console.error);