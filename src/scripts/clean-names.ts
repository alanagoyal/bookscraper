
import { supabase } from '../services/supabase.ts';
import { cleanName } from '../utils/clean-names.ts';

async function cleanPeopleNames() {
  try {
    // Fetch people created on March 27th
    const { data: people, error } = await supabase
      .from('people')
      .select('id, full_name')
      .gte('created_at', '2025-03-27T00:00:00Z')
      .lt('created_at', '2025-03-28T00:00:00Z');

    if (error) {
      throw error;
    }

    if (!people || people.length === 0) {
      console.log('No people found created on March 27th.');
      return;
    }

    console.log(`Processing ${people.length} names from March 27th...`);

    // Process each person
    for (const person of people) {
      const cleanedName = cleanName(person.full_name);
      
      // Only update if the name actually changed
      if (cleanedName !== person.full_name) {
        const { error: updateError } = await supabase
          .from('people')
          .update({ full_name: cleanedName })
          .eq('id', person.id);

        if (updateError) {
          console.error(`Error updating person ${person.id}:`, updateError);
          continue;
        }

        console.log(`Updated: "${person.full_name}" -> "${cleanedName}"`);
      }
    }

    console.log('Name cleaning completed successfully!');
  } catch (error) {
    console.error('Error cleaning names:', error);
  }
}

// Run the script
cleanPeopleNames();
