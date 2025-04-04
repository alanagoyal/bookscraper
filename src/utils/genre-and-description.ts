import { initLogger, invoke } from "braintrust";
import { z } from "zod";

// Initialize Braintrust logger
initLogger({
  projectName: "booklist",
  apiKey: process.env.BRAINTRUST_API_KEY,
});

export const STANDARD_GENRES = [
  'Fiction', 'Historical', 'Classic', 'Nonfiction', 'Economics', 'Politics',
  'Science Fiction', 'Fantasy', 'Mystery', 'Horror', 'Romance', 'History',
  'Biography', 'Memoir', 'Self-Help', 'Business', 'Science', 'Philosophy',
  'Poetry', 'Young Adult', 'Children', 'Misc'
] as const;

type StandardGenre = typeof STANDARD_GENRES[number];

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

  // Filter out non-standard genres
  const standardizedGenres = result.genre.filter((g): g is StandardGenre => 
    STANDARD_GENRES.includes(g as StandardGenre)
  );

  // Ensure there's at least one genre
  if (standardizedGenres.length === 0) {
    standardizedGenres.push('Misc');
  }

  return {
    genre: standardizedGenres,
    description: result.description
  };
}