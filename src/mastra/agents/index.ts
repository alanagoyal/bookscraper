import { openai } from '@ai-sdk/openai';
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { TokenLimiter } from '@mastra/memory/processors';
import { getRecommendationsForPersonTool, getRecommendationsForBookTool, getRecommendationsForPersonTypeTool, getRecommendationsForGenreTool, getRecommendationsForTwoPeopleTool, getTopOverlappingRecommendersTool, getTopGenresByPersonTypeTool, getMostSimilarTypesTool, getGenreCountByTypeTool, getGenreOutliersInTypeTool, getBooksBySingleTypeTool, getMostDiverseRecommendersTool, getBooksWithMostTypeDiversityTool, getTopGenresByRecommendersTool, getGenreOverlapStatsTool, getRecommendationDistributionTool, getBooksByEmbeddingSimilarityTool, getPersonEmbeddingCentroidTool, getTypeEmbeddingCentroidTool } from '../tools';

export const booklistAgent = new Agent({
  name: 'Booklist Agent',
  instructions: `
      You are an expert book recommendation agent with deep knowledge of literature and reading preferences.

      Your primary functions are to:
      - Provide personalized book recommendations based on user preferences, genres, or similar books
      - Find connections between books, authors, and reading patterns
      - Analyze reading preferences and suggest books that match specific criteria
      - Help users discover new books and authors they might enjoy

      When making recommendations:
      - Consider the user's reading history and preferences if provided
      - Include a brief explanation of why each book was recommended
      - Mention relevant details like genre, themes, and writing style
      - If recommending based on another book, explain the connections
      - Keep responses focused and informative
      - Suggest 3-5 books unless specifically asked for more

      Use the available tools to:
      - Get general book recommendations
      - Find books similar to a specific book
      - Get recommendations for specific person types or genres
      - Find books that would appeal to multiple people
`,
  model: openai('gpt-4o-mini'),
  memory: new Memory({
    processors: [
      new TokenLimiter(127000), // Set token limit for GPT-4
    ],
  }),
  tools: { getRecommendationsForPersonTool, getRecommendationsForBookTool, getRecommendationsForPersonTypeTool, getRecommendationsForGenreTool, getRecommendationsForTwoPeopleTool, getTopOverlappingRecommendersTool, getTopGenresByPersonTypeTool, getMostSimilarTypesTool, getGenreCountByTypeTool, getGenreOutliersInTypeTool, getBooksBySingleTypeTool, getMostDiverseRecommendersTool, getBooksWithMostTypeDiversityTool, getTopGenresByRecommendersTool, getGenreOverlapStatsTool, getRecommendationDistributionTool, getBooksByEmbeddingSimilarityTool, getPersonEmbeddingCentroidTool, getTypeEmbeddingCentroidTool }, // all of the tools from /tools
});
