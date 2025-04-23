import { supabase } from '../services/supabase.ts';
import { createPersonEmbeddings } from '../utils/embeddings.ts';

// To run: npx tsx src/scripts/person-embeddings.ts
async function run() {
  try {
    // Get all people
    const { data: people, error: queryError } = await supabase
      .from('people')
      .select()
      .is('description_embedding', null)
      .order('created_at', { ascending: true });

    if (queryError) {
      console.error('Error querying people:', queryError);
      return;
    }

    console.log(`Found ${people?.length || 0} people to process`);

    // Process each person
    for (const person of people || []) {
      try {
        const { full_name, description } = person;
        
        if (description) {
          console.log(`Creating embeddings for: "${full_name}"`);

          // Create embeddings
          const embeddings = await createPersonEmbeddings(full_name, description);
          const { error: updateError } = await supabase
            .from('people')
            .update(embeddings)
            .eq('id', person.id);
          
          if (updateError) {
            console.error(`Failed to update person ${person.id}:`, updateError);
          }
        }
      } catch (error) {
        console.error(`Error processing person ${person.id}:`, error);
      }
    }

    console.log('Embeddings creation complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

run().catch(console.error);