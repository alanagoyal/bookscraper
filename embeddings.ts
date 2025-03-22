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

interface BookEmbeddings {
  title_embedding: number[];
  author_embedding: number[];
  description_embedding: number[];
}

async function createFieldEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

async function createBookEmbeddings(title: string, author: string, description: string): Promise<BookEmbeddings> {
  const [title_embedding, author_embedding, description_embedding] = await Promise.all([
    createFieldEmbedding(title),
    createFieldEmbedding(author),
    createFieldEmbedding(description)
  ]);

  return {
    title_embedding,
    author_embedding,
    description_embedding
  };
}

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
        
        if (title && author && description) {
          console.log(`Creating embeddings for: "${title}" by ${author}`);

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