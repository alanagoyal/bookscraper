import { Stagehand } from "@browserbasehq/stagehand";
import { z } from "zod";
import StagehandConfig from "../../stagehand.config.ts";
import { supabase } from "../services/supabase.ts";
import { generateDescription } from "../utils/person.ts";

async function run() {
  try {
    // Initialize Stagehand
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    const { page } = stagehand;

    // Get all people with null descriptions
    const { data: people, error: queryError } = await supabase
      .from("people")
      .select("id, full_name, url, type")
      .is("description", null)
      .not("url", "is", null); // Only get people who have URLs

    if (queryError) {
      console.error("Error querying people:", queryError);
      return;
    }

    console.log(`Found ${people?.length || 0} people without descriptions`);

    const specialTypes = [
      "Entertainer",
      "Musician or Filmmaker",
      "Chef or Food Writer",
      "Technologist",
      "Journalist",
      "Executive",
      "Biographer",
      "Investor",
      "Architect or Designer",
      "Entrepreneur",
      "Author"
    ];

    // Sort people array to process special types first
    const sortedPeople = [...(people || [])].sort((a, b) => {
      const aIsSpecial = a.type && specialTypes.includes(a.type);
      const bIsSpecial = b.type && specialTypes.includes(b.type);
      if (aIsSpecial && !bIsSpecial) return -1;
      if (!aIsSpecial && bIsSpecial) return 1;
      return 0;
    });

    // Process each person
    for (const person of sortedPeople) {
      try {
        const isSpecialType = person.type && specialTypes.includes(person.type);
        console.log(`Processing ${person.full_name}... (${isSpecialType ? 'Special Type' : 'Standard Type'})`);

        let description;
        if (isSpecialType) {
          // Use generateDescription for special types
          const result = await generateDescription(person.full_name, person.type);
          description = result.description;
        } else {
          // Visit their URL for standard extraction
          await page.goto(person.url);
          const extractResult = await page.extract({
            instruction: `Extract a 1 sentence description about ${person.full_name} from their profile or bio. Focus on their main role, achievements, or expertise.`,
            schema: z.object({
              description: z.string(),
            }),
            useTextExtract: true,
          });
          description = extractResult.description;
        }

        if (description) {
          // Update the person's description in the database
          const { error: updateError } = await supabase
            .from("people")
            .update({ description })
            .eq("id", person.id);

          if (updateError) {
            console.error(
              `Error updating description for ${person.full_name}:`,
              updateError
            );
          } else {
            console.log(`Updated description for ${person.full_name}: ${description}`);
          }
        }
      } catch (error) {
        console.error(`Error processing ${person.full_name}:`, error);
      }
    }

    console.log("Description updates complete");
    await stagehand.close();
  } catch (error) {
    console.error("Error in run function:", error);
  }
}

run().catch(console.error);
