import { Stagehand } from "@browserbasehq/stagehand";
import { z } from 'zod';

export async function findAmazonUrl(page: Stagehand['page'], title: string, author: string) {
  await page.goto('https://www.google.com');
  
  // Search for book on Google
  const searchQuery = `${title} ${author} amazon`;
  await page.act("Type '" + searchQuery + "' into the search input");
  await page.act("Press Enter");

  // Extract the first Amazon link
  const { links } = await page.extract({
    instruction: "Extract the first link that contains 'amazon.com'",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  return links[0] || null;
}
