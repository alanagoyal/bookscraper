import { createClient } from '@supabase/supabase-js';
import { initLogger, invoke } from 'braintrust';
import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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

async function categorizePerson(person: string) {
  const result = await invoke({
    projectName: "booklist",
    slug: "categorize-person-7bb3",
    input: { person },
    schema: z.object({
      type: z.string()
    }),
  });
  return result;
}

async function run() {
  try {
    // Get all uncategorized people
    const { data: people, error: queryError } = await supabase
      .from('people')
      .select('id, full_name, type')
      .is('type', null)
      .order('full_name', { ascending: true });

    if (queryError) {
      console.error('Error querying people:', queryError);
      return;
    }

    console.log(`Found ${people?.length || 0} uncategorized people`);

    // Process each person
    for (const person of people || []) {
      try {
        const { type } = await categorizePerson(person.full_name);
        console.log(`${person.full_name} -> ${type}`);

        // Update the type
        const { error: updateError } = await supabase
          .from('people')
          .update({ type })
          .eq('id', person.id);
        
        if (updateError) {
          console.error(`Failed to update ${person.full_name}:`, updateError);
        }
      } catch (error) {
        console.error(`Error processing ${person.full_name}:`, error);
      }
    }
  } catch (error) {
    console.error('Error:', error);
  }
}

run().catch(console.error);