import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// To run: npx tsx title-case.ts

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function toTitleCase(text: string): string {
  const minorWords = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for',
    'if', 'in', 'nor', 'of', 'on', 'or', 'so', 'the',
    'to', 'yet'
  ]);
  const punctuationTriggers = new Set([':', '(', '[', '{', '"', '\'', '—', '–']); // dash types too

  const words = text.toLowerCase().split(/\s+/); // split on spaces
  let result = [];
  let capitalizeNext = true; // first word should be capitalized

  for (let i = 0; i < words.length; i++) {
    let word = words[i];

    // Check if previous word ends with punctuation that triggers capitalization
    if (i > 0) {
      const lastCharPrevWord = words[i - 1].slice(-1);
      if (punctuationTriggers.has(lastCharPrevWord)) {
        capitalizeNext = true;
      }
    }

    // Remove leading punctuation from word for checking
    const leadingPunctMatch = word.match(/^([(\[{"']*)(.*)$/);
    const leadingPunct = leadingPunctMatch?.[1] || '';
    word = leadingPunctMatch?.[2] || word;

    // Capitalize as needed
    if (capitalizeNext || !minorWords.has(word)) {
      word = word.charAt(0).toUpperCase() + word.slice(1);
    }

    // Re-add leading punctuation
    word = leadingPunct + word;
    result.push(word);

    // Determine if next word should be capitalized
    const lastChar = word.slice(-1);
    capitalizeNext = punctuationTriggers.has(lastChar);
  }

  return result.join(' ');
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
        const titleCased = toTitleCase(book.title);
        
        if (titleCased !== book.title) {
          console.log(`Converting: "${book.title}" -> "${titleCased}"`);

          // Update the title
          const { error: updateError } = await supabase
            .from('books')
            .update({ title: titleCased })
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