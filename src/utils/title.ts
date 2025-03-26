import { initLogger, invoke } from "braintrust";
import { z } from "zod";

// Initialize Braintrust logger
initLogger({
  projectName: "booklist",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

// Helper function to sanitize title using braintrust
export async function sanitizeTitle(title: string) {
  const result = await invoke({
    projectName: "booklist",
    slug: "sanitize-title-fc91",
    input: { title },
    schema: z.object({
      title: z.string(),
    }),
  });
  return result;
}
