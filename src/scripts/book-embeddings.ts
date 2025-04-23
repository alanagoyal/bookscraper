import { supabase } from '../services/supabase.ts';
import { createBookEmbeddings } from '../utils/embeddings.ts';

// To run: npx tsx book-embeddings.ts
async function run() {
  try {
    // Get all books
    const { data: books, error: queryError } = await supabase
      .from('books')
      .select()
      .is('title_embedding', null)
      .order('created_at', { ascending: true });

    if (queryError) {
      console.error('Error querying books:', queryError);
      return;
    }

    console.log(`Found ${books?.length || 0} books to process`);

    // Process each book
    for (const book of books || []) {
      try {
        const { title, author, description } = book;
        
        if (description) {
          console.log(`Creating embeddings for: "${title}"`);

          // Create embeddings
          const embeddings = await createBookEmbeddings(title, author, description);
          const { error: updateError } = await supabase
            .from('books')
            .update(embeddings)
            .eq('id', book.id);
          
          if (updateError) {
            console.error(`Failed to update book ${book.id}:`, updateError);
          }
        }
      } catch (error) {
        console.error(`Error processing book ${book.id}:`, error);
      }
    }

    console.log('Embeddings creation complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

run().catch(console.error);