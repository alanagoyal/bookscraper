import { supabase } from '../services/supabase.ts';
import { categorizePerson } from '../utils/person.ts';

// To run: npx tsx person.ts
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

        // Update the category
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