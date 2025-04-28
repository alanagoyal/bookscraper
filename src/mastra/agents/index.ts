import { openai } from "@ai-sdk/openai";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { TokenLimiter } from "@mastra/memory/processors";
import {
  getBooksBySingleTypeTool,
  getBooksWithMostTypeDiversityTool,
  getGenreCountByTypeTool,
  getGenreOutliersInTypeTool,
  getGenreOverlapStatsTool,
  getInfluentialRecommendersTool,
  getMostRecommendedBooksTool,
  getMostSimilarTypesTool,
  getPeopleMutualRecommendationsTool,
  getRecommendationsForBookTool,
  getRecommendationsForGenreTool,
  getRecommendationsForPersonTool,
  getRecommendationsForPersonTypeTool,
  getSimilarBooksToBookByDescriptionTool,
  getSimilarPeopleByDescriptionEmbeddingTool,
  getTopGenresByRecommendersTool,
  getTopOverlappingRecommendersTool,
  getTopSimilarBooksWithOverlapTool,
  getTopSimilarPeopleWithOverlapTool,
} from "../tools";

export const booklistAgent = new Agent({
  name: "Booklist Agent",
  instructions: `
      you are analyzing a dataset of over 12,000 book recommendations from 2,000 notable people — engineers, philosophers, investors, chefs, and more.

you have access to tools that let you query genres, types, recommendations, embeddings, and relationships between people and books. your goal is to generate the structure for a data-driven blog post that surfaces interesting literary and cultural insights.

## 🧠 your task:

for each question, answer with:
- a table summarizing the data
- a short summary of the data
- 1-2 interesting insights or patterns
- 1-2 sentences on what that could mean or why it's interesting
`,
  model: openai("gpt-4.1-mini"),
  memory: new Memory({
    processors: [
      new TokenLimiter(127000), // Set token limit for GPT-4
    ],
  }),
  tools: {
    getRecommendationsForPersonTool,
    getRecommendationsForBookTool,
    getRecommendationsForPersonTypeTool,
    getRecommendationsForGenreTool,
    getPeopleMutualRecommendationsTool,
    getTopOverlappingRecommendersTool,
    getGenreOutliersInTypeTool,
    getInfluentialRecommendersTool,
    getSimilarPeopleByDescriptionEmbeddingTool,
    getTopSimilarPeopleWithOverlapTool,
    getMostSimilarTypesTool,
    getGenreCountByTypeTool,
    getBooksBySingleTypeTool,
    getBooksWithMostTypeDiversityTool,
    getMostRecommendedBooksTool,
    getSimilarBooksToBookByDescriptionTool,
    getTopSimilarBooksWithOverlapTool,
    getTopGenresByRecommendersTool,
    getGenreOverlapStatsTool,
  },
});
