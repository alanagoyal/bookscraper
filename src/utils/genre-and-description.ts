import { initLogger, invoke } from "braintrust";
import { z } from "zod";

// Initialize Braintrust logger
initLogger({
  projectName: "booklist",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

export async function generateGenreAndDescription(title: string, author: string) {
    const result = await invoke({
      projectName: "booklist",
      slug: "genre-and-description-0680",
      input: { title, author },
      schema: z.object({
        genre: z.array(z.string()),
        description: z.string()
      }),
    });
    return result;
  }
  