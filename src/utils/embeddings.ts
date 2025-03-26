import { openai } from '../services/openai.ts';

interface BookEmbeddings {
  title_embedding: number[];
  author_embedding: number[];
  description_embedding: number[];
}

// Helper function to create embeddings for a single field
export async function createFieldEmbedding(text: string) {
  const response = await openai.embeddings.create({
    model: "text-embedding-ada-002",
    input: text,
  });
  return response.data[0].embedding;
}

// Helper function to create embeddings for a book
export async function createBookEmbeddings(
  title: string,
  author: string,
  description: string
): Promise<BookEmbeddings> {
  const [title_embedding, author_embedding, description_embedding] =
    await Promise.all([
      createFieldEmbedding(title),
      createFieldEmbedding(author),
      createFieldEmbedding(description),
    ]);

  return {
    title_embedding,
    author_embedding,
    description_embedding,
  };
}
