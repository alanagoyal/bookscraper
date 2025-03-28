import { supabase } from "../services/supabase.ts";
import { categorizePerson } from "../utils/person.ts";

const VALID_TYPES = [
  "Anthropologists & Social Scientists",
  "Architects & Design Experts",
  "Art Historians, Critics & Visual Artists",
  "Authors & Writers",
  "Biographers & Memoirists",
  "Biologists, Physicists & Medical Scientists",
  "Broadcasters, Journalists & Media Commentators",
  "Comedians, Magicians & Entertainers",
  "Cooks, Food Writers & Culinary Experts",
  "Economists & Policy Experts",
  "Entrepreneurs & Startup Founders",
  "Venture Capitalists & Investors",
  "Business Leaders & Executives",
  "Product Managers, Designers & Engineers",
  "Historians, Philosophers & Theologians",
  "Musicians, Music Critics & Filmmakers",
  "Technologists & Mathematicians",
  "Librarians & Teachers",
];

// To run: npx tsx person.ts
async function run() {
  try {
    // Get all people who either have no type or have a type not in our valid list
    const { data: people, error: queryError } = await supabase
      .from("people")
      .select("id, full_name, type")
      .or(
        `type.is.null,type.not.in.(${VALID_TYPES.map((t) => `"${t}"`).join(
          ","
        )})`
      )
      .order("full_name", { ascending: true });

    if (queryError) {
      console.error("Error querying people:", queryError);
      return;
    }

    console.log(`Found ${people?.length || 0} people to categorize`);

    // Process each person
    for (const person of people || []) {
      try {
        // Only categorize if type is null or not in valid list
        if (!person.type || !VALID_TYPES.includes(person.type)) {
          const { type } = await categorizePerson(person.full_name);
          console.log(`${person.full_name} -> ${type}`);

          // Update the category
          const { error: updateError } = await supabase
            .from("people")
            .update({ type })
            .eq("id", person.id);

          if (updateError) {
            console.error(
              `Error updating person ${person.full_name}:`,
              updateError
            );
          }
        }
      } catch (error) {
        console.error(`Error processing person ${person.full_name}:`, error);
      }
    }
  } catch (error) {
    console.error("Error in run function:", error);
  }
}

run().catch(console.error);
