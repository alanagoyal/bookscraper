import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import OpenAI from 'openai';

dotenv.config();

// To run: npx tsx embeddings.ts

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

if (!openaiKey) {
  throw new Error('Missing OPENAI_API_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);
const openai = new OpenAI({ apiKey: openaiKey });

async function createEmbedding(title: string, author: string) {
  const text = `${title} by ${author}`;
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  
  return response.data[0].embedding;
}

async function run() {
  try {
    // Get all books
    const { data: books, error: queryError } = await supabase
      .from('books')
      .select()
      .is('embedding', null)
      .order('created_at', { ascending: true });

    if (queryError) {
      console.error('Error querying books:', queryError);
      return;
    }

    console.log(`Found ${books?.length || 0} books to process`);

    // Process each book
    for (const book of books || []) {
      try {
        const { title, author } = book;
        
        if (title && author) {
          console.log(`Creating embedding for: "${title}" by ${author}`);

          // Create embedding
          const embedding = await createEmbedding(title, author);
          const { error: updateError } = await supabase
            .from('books')
            .update({ embedding })
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