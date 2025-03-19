import { createClient } from '@supabase/supabase-js';
import { initLogger, invoke } from 'braintrust';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// To run: npx tsx title-case.ts

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

async function sanitizeTitle(title: string) {
  const result = await invoke({
    projectName: "booklist",
    slug: "sanitize-title-fc91",
    input: { title },
    schema: z.object({
      title: z.string()
    }),
  });
  return result;
}

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