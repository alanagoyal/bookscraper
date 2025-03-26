import { supabase } from '../services/supabase.js';
import { sanitizeTitle } from '../utils/title';

// To run: npx tsx title.ts
async function run() {
  try {
    // Get all books
    const { data: books, error: queryError } = await supabase
      .from('books')
      .select('id, title')
      .order('title', { ascending: true });

    if (queryError) {
      console.error('Error querying books:', queryError);
      return;
    }

    console.log(`Found ${books?.length || 0} books to process`);

    // Process each book
    for (const book of books || []) {
      try {
        const { title } = await sanitizeTitle(book.title);
        
        if (title !== book.title) {
          console.log(`Converting: "${book.title}" -> "${title}"`);

          // Update the title
          const { error: updateError } = await supabase
            .from('books')
            .update({ title })
            .eq('id', book.id);
          
          if (updateError) {
            console.error(`Failed to update book ${book.id}:`, updateError);
          }
        }
      } catch (error) {
        console.error(`Error processing book ${book.id}:`, error);
      }
    }

    console.log('Title case conversion complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

run().catch(console.error);