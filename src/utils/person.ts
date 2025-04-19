import { initLogger, invoke } from "braintrust";
import { z } from "zod";

// Initialize Braintrust logger
initLogger({
    projectName: "booklist",
    apiKey: process.env.BRAINTRUST_API_KEY,
  });

// Helper function to categorize person using braintrust
export async function categorizePerson(person: string) {
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

  // Helper function to generate description using braintrust
  export async function generateDescription(full_name: string, type: string) {
    const result = await invoke({
      projectName: "booklist",
      slug: "describe-person-bda8",
      input: { full_name, type },
      schema: z.object({
        description: z.string()
      }),
    });
    return result;
  }
    