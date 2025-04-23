import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabase } from '../../services/supabase';

interface Book {
  id: string;
  title: string;
  author: string;
  description: string | null;
  amazon_url: string | null;
  genre: string[];
}

interface Person {
  id: string;
  full_name: string;
  description: string | null;
  type: string | null;
  url: string | null;
}

interface Recommendation {
  id: string;
  book_id: string;
  person_id: string;
  source: string;
  source_link: string | null;
}

interface RecommendationWithBookAndPerson extends Recommendation {
  book: Book;
  person: Person;
}

interface RecommendationType {
  id: string;
  book_id: string;
  person_id: string;
  source: string;
  source_link: string | null;
  book?: {
    id: string;
    title: string;
    author: string;
    description: string | null;
    amazon_url: string | null;
    genre: string[];
  };
  person: {
    id: string;
    full_name: string;
    type: string | null;
    description: string | null;
    url: string | null;
  };
}

interface RecommendationsResponse {
  recommendations: RecommendationType[];
}

interface RawRecommendation {
  id: string;
  book_id: string;
  person_id: string;
  source: string;
  source_link: string | null;
  book: {
    id: string;
    title: string;
    author: string;
    description: string | null;
    amazon_url: string | null;
    genre: string[];
  }[];
  person: {
    id: string;
    full_name: string;
    type: string | null;
    description: string | null;
    url: string | null;
  }[];
}

// Tool to get recommendations from a specific person
export const getRecommendationsForPersonTool = createTool({
  id: 'get-recommendations-for-person',
  description: 'Get book recommendations from a specific person',
  inputSchema: z.object({
    full_name: z.string().describe('Person full name'),
  }),
  outputSchema: z.object({
    recommendations: z.array(
      z.object({
        id: z.string(),
        book_id: z.string(),
        person_id: z.string(),
        source: z.string(),
        source_link: z.string().nullable(),
        book: z.object({
          id: z.string(),
          title: z.string(),
          author: z.string(),
          description: z.string().nullable(),
          amazon_url: z.string().nullable(),
          genre: z.array(z.string()),
        }),
        person: z.object({
          id: z.string(),
          full_name: z.string(),
          type: z.string().nullable(),
          description: z.string().nullable(),
          url: z.string().nullable(),
        }),
      })
    ),
  }),
  execute: async ({ context }) => {
    // First get the person ID from the full name
    const { data: person, error: personError } = await supabase
      .from('people')
      .select('id')
      .eq('full_name', context.full_name)
      .single();

    if (personError) {
      throw new Error(`Error finding person by full name: ${personError.message}`);
    }

    if (!person) {
      throw new Error(`Person with full name "${context.full_name}" not found`);
    }

    const { data: rawRecommendations, error: queryError } = await supabase
      .from('recommendations')
      .select(`
        id,
        book_id,
        person_id,
        source,
        source_link,
        book:books(
          id,
          title,
          author,
          description,
          amazon_url,
          genre
        ),
        person:people(
          id,
          full_name,
          type,
          description,
          url
        )
      `)
      .eq('person_id', person.id);

    if (queryError) {
      throw new Error(`Error querying recommendations: ${queryError.message}`);
    }

    // Transform the data to match our types
    const recommendations = (rawRecommendations as RawRecommendation[] | null)?.map(rec => {
      const book = Array.isArray(rec.book) ? rec.book[0] : rec.book;
      const person = Array.isArray(rec.person) ? rec.person[0] : rec.person;
      
      // Skip recommendations without a book
      if (!book) {
        return null;
      }

      return {
        id: rec.id,
        book_id: rec.book_id,
        person_id: rec.person_id,
        source: rec.source,
        source_link: rec.source_link,
        book,
        person
      };
    }).filter((rec): rec is NonNullable<typeof rec> => rec !== null) || [];

    return { recommendations };
  },
});

// Tool to get recommendations from a specific book
export const getRecommendationsForBookTool = createTool({
  id: 'get-recommendations-for-book',
  description: 'Get recommendations from a specific book',
  inputSchema: z.object({
    title: z.string().describe('Book title'),
    author: z.string().describe('Book author'),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      id: z.string(),
      book_id: z.string(),
      person_id: z.string(),
      source: z.string(),
      source_link: z.string().nullable(),
      person: z.object({
        id: z.string(),
        full_name: z.string(),
        description: z.string().nullable(),
        type: z.string().nullable(),
        url: z.string().nullable(),
      }),
    })),
  }),
  execute: async ({ context }) => {
    // First find the book by title and author
    const { data: books, error: bookError } = await supabase
      .from('books')
      .select('id')
      .ilike('title', context.title)
      .ilike('author', context.author)
      .limit(1);

    if (bookError) {
      throw new Error(`Error finding book: ${bookError.message}`);
    }

    if (!books || books.length === 0) {
      throw new Error(`No book found with title "${context.title}" by ${context.author}`);
    }

    const bookId = books[0].id;

    // Then get recommendations for that book
    const { data: rawRecommendations, error: queryError } = await supabase
      .from('recommendations')
      .select(`
        id,
        book_id,
        person_id,
        source,
        source_link,
        person:people(
          id,
          full_name,
          type,
          description,
          url
        )
      `)
      .eq('book_id', bookId);

    if (queryError) {
      throw new Error(`Error querying recommendations: ${queryError.message}`);
    }

    // Transform the data to match our types
    const recommendations = rawRecommendations?.map(rec => ({
      ...rec,
      person: Array.isArray(rec.person) ? rec.person[0] : rec.person
    })) as RecommendationType[];

    return { recommendations };
  },
});

// Tool to get recommendations from a specific type of person
export const getRecommendationsForPersonTypeTool = createTool({
  id: 'get-recommendations-for-person-type',
  description: 'Get recommendations from a specific type of person',
  inputSchema: z.object({
    type: z.string().describe('Person type'),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      id: z.string(),
      book_id: z.string(),
      person_id: z.string(),
      source: z.string(),
      source_link: z.string().nullable(),
      book: z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        description: z.string().nullable(),
        amazon_url: z.string().nullable(),
        genre: z.array(z.string()),
      }),
      person: z.object({
        id: z.string(),
        full_name: z.string(),
        description: z.string().nullable(),
        type: z.string().nullable(),
        url: z.string().nullable(),
      }),
    })),
  }),
  execute: async ({ context }) => {
    const { data: rawRecommendations, error: queryError } = await supabase
      .from('recommendations')
      .select(`
        id,
        book_id,
        person_id,
        source,
        source_link,
        book:books(
          id,
          title,
          author,
          description,
          amazon_url,
          genre
        ),
        person:people(
          id,
          full_name,
          type,
          description,
          url
        )
      `)
      .eq('person.type', context.type);

    if (queryError) {
      throw new Error(`Error querying recommendations: ${queryError.message}`);
    }

    // Transform the data to match our types
    const recommendations = (rawRecommendations as RawRecommendation[] | null)?.map(rec => {
      const book = Array.isArray(rec.book) ? rec.book[0] : rec.book;
      const person = Array.isArray(rec.person) ? rec.person[0] : rec.person;
      
      // Skip recommendations without a book
      if (!book) {
        return null;
      }

      return {
        id: rec.id,
        book_id: rec.book_id,
        person_id: rec.person_id,
        source: rec.source,
        source_link: rec.source_link,
        book,
        person
      };
    }).filter((rec): rec is NonNullable<typeof rec> => rec !== null) || [];

    return { recommendations };
  },
});

// Tool to get recommendations from a specific genre
export const getRecommendationsForGenreTool = createTool({
  id: 'get-recommendations-for-genre',
  description: 'Get recommendations from a specific genre',
  inputSchema: z.object({
    genre: z.string().describe('Genre'),
  }),
  outputSchema: z.object({
    recommendations: z.array(z.object({
      id: z.string(),
      book_id: z.string(),
      person_id: z.string(),
      source: z.string(),
      source_link: z.string().nullable(),
      book: z.object({
        id: z.string(),
        title: z.string(),
        author: z.string(),
        description: z.string().nullable(),
        amazon_url: z.string().nullable(),
        genre: z.array(z.string()),
      }),
      person: z.object({
        id: z.string(),
        full_name: z.string(),
        description: z.string().nullable(),
        type: z.string().nullable(),
        url: z.string().nullable(),
      }),
    })),
  }),
  execute: async ({ context }) => {
    const { data: rawRecommendations, error: queryError } = await supabase
      .from('recommendations')
      .select(`
        id,
        book_id,
        person_id,
        source,
        source_link,
        book:books(
          id, 
          title, 
          author, 
          description,
          amazon_url,
          genre
        ),
        person:people(
          id,
          full_name,
          type,
          description,
          url
        )
      `)
      .eq('book.genre', context.genre);

    if (queryError) {
      throw new Error(`Error querying recommendations: ${queryError.message}`);
    }

    // Transform the data to match our types
    const recommendations = (rawRecommendations as RawRecommendation[] | null)?.map(rec => {
      const book = Array.isArray(rec.book) ? rec.book[0] : rec.book;
      const person = Array.isArray(rec.person) ? rec.person[0] : rec.person;
      
      // Skip recommendations without a book
      if (!book) {
        return null;
      }

      return {
        id: rec.id,
        book_id: rec.book_id,
        person_id: rec.person_id,
        source: rec.source,
        source_link: rec.source_link,
        book,
        person
      };
    }).filter((rec): rec is NonNullable<typeof rec> => rec !== null) || [];

    return { recommendations };
  },
});

// Tool to get the count of recommendations two people have in common
export const getRecommendationsForTwoPeopleTool = createTool({
  id: 'get-recommendations-for-two-people',
  description: 'Get the count of recommendations two people have in common',
  inputSchema: z.object({
    person1_name: z.string().describe('Full name of first person'),
    person2_name: z.string().describe('Full name of second person'),
  }),
  outputSchema: z.object({
    count: z.number(),
  }),
  execute: async ({ context }) => {
    // First find both people by their names
    const { data: person1, error: error1 } = await supabase
      .from('people')
      .select('id')
      .ilike('full_name', context.person1_name)
      .limit(1);

    if (error1) {
      throw new Error(`Error finding first person: ${error1.message}`);
    }

    if (!person1 || person1.length === 0) {
      throw new Error(`No person found with name "${context.person1_name}"`);
    }

    const { data: person2, error: error2 } = await supabase
      .from('people')
      .select('id')
      .ilike('full_name', context.person2_name)
      .limit(1);

    if (error2) {
      throw new Error(`Error finding second person: ${error2.message}`);
    }

    if (!person2 || person2.length === 0) {
      throw new Error(`No person found with name "${context.person2_name}"`);
    }

    // Get recommendations that both people have made
    const { data: rawRecommendations, error: queryError } = await supabase
      .from('recommendations')
      .select(`
        id,
        book_id,
        person_id,
        source,
        source_link,
        book:books(
          id,
          title,
          author,
          description,
          amazon_url,
          genre
        ),
        person:people(
          id,
          full_name,
          type,
          description,
          url
        )
      `)
      .in('person_id', [person1[0].id, person2[0].id]);

    if (queryError) {
      throw new Error(`Error querying recommendations: ${queryError.message}`);
    }

    // Transform the data to match our types
    const recommendations = (rawRecommendations as RawRecommendation[] | null)?.map(rec => {
      const book = Array.isArray(rec.book) ? rec.book[0] : rec.book;
      const person = Array.isArray(rec.person) ? rec.person[0] : rec.person;
      
      // Skip recommendations without a book
      if (!book) {
        return null;
      }

      return {
        id: rec.id,
        book_id: rec.book_id,
        person_id: rec.person_id,
        source: rec.source,
        source_link: rec.source_link,
        book,
        person
      };
    }).filter((rec): rec is NonNullable<typeof rec> => rec !== null) || [];

    // Count books that appear for both people
    const bookCounts = recommendations.reduce((acc, rec) => {
      acc[rec.book_id] = (acc[rec.book_id] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const commonBooks = Object.values(bookCounts).filter(count => count === 2);
    
    return { count: commonBooks.length };
  },
});

// Tool to get top pairs of recommenders who recommend the most books in common
export const getTopOverlappingRecommendersTool = createTool({
  id: 'get-top-overlapping-recommenders',
  description: 'Get top pairs of recommenders who recommend the most books in common',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    overlaps: z.array(z.object({
      person1_id: z.string(),
      person2_id: z.string(),
      shared_book_count: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_top_overlapping_recommenders', {
      limit_arg: context.limit,
    });
    if (error) throw new Error(error.message);
    return { overlaps: data };
  },
});

// Tool to get top genres recommended by a specific person type
export const getTopGenresByPersonTypeTool = createTool({
  id: 'get-top-genres-by-person-type',
  description: 'Get the most recommended genres for a given person type',
  inputSchema: z.object({ type: z.string() }),
  outputSchema: z.object({
    genres: z.array(z.object({
      genre: z.string(),
      count: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_top_genres_by_type', {
      type_arg: context.type,
    });
    if (error) throw new Error(error.message);
    return { genres: data };
  },
});

// Tool to get books recommended by the widest range of person types
export const getBooksRecommendedAcrossTypesTool = createTool({
  id: 'get-books-recommended-across-types',
  description: 'Get books recommended by the widest range of person types',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    books: z.array(z.object({
      book_id: z.string(),
      title: z.string(),
      type_count: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_books_with_type_diversity', {
      limit_arg: context.limit,
    });
    if (error) throw new Error(error.message);
    return { books: data };
  },
});

// Tool to get recommenders who suggest books from the widest range of genres
export const getMostGenreDiverseRecommendersTool = createTool({
  id: 'get-most-genre-diverse-recommenders',
  description: 'Get recommenders who suggest books from the widest range of genres',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    recommenders: z.array(z.object({
      person_id: z.string(),
      full_name: z.string(),
      genre_count: z.number(),
    })),
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_genre_diverse_recommenders', {
      limit_arg: context.limit,
    });
    if (error) throw new Error(error.message);
    return { recommenders: data };
  },
});

// Tool to find pairs of types with the most similar book tastes
export const getMostSimilarTypesTool = createTool({
  id: 'get-most-similar-types',
  description: 'Find which types of people have the most similar book taste (overlapping books)',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    pairs: z.array(z.object({
      type1: z.string(),
      type2: z.string(),
      shared_book_count: z.number(),
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_most_similar_types', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { pairs: data };
  }
});

// Tool to find the number of genres recommended by each type of person
export const getGenreCountByTypeTool = createTool({
  id: 'get-genre-count-by-type',
  description: 'See which types recommend the widest variety of genres',
  inputSchema: z.object({}),
  outputSchema: z.object({
    results: z.array(z.object({
      type: z.string(),
      genre_count: z.number()
    }))
  }),
  execute: async () => {
    const { data, error } = await supabase.rpc('get_genre_count_by_type');
    if (error) throw new Error(error.message);
    return { results: data };
  }
});

// Tool to find people who recommend only one genre while others in their type recommend many
export const getGenreOutliersInTypeTool = createTool({
  id: 'get-genre-outliers-in-type',
  description: 'Find people who recommend only one genre while others in their type recommend many',
  inputSchema: z.object({}),
  outputSchema: z.object({
    outliers: z.array(z.object({
      person_id: z.string(),
      full_name: z.string(),
      type: z.string(),
      genre_count: z.number()
    }))
  }),
  execute: async () => {
    const { data, error } = await supabase.rpc('get_genre_outliers_in_type');
    if (error) throw new Error(error.message);
    return { outliers: data };
  }
});

// Tool to find books that are only recommended by one type of person
export const getBooksBySingleTypeTool = createTool({
  id: 'get-books-by-single-type',
  description: 'Find books that are only recommended by one type of person',
  inputSchema: z.object({}),
  outputSchema: z.object({
    books: z.array(z.object({
      book_id: z.string(),
      title: z.string(),
      only_type: z.string()
    }))
  }),
  execute: async () => {
    const { data, error } = await supabase.rpc('get_books_by_single_type');
    if (error) throw new Error(error.message);
    return { books: data };
  }
});

// Tool to find people who recommend across the most genres
export const getMostDiverseRecommendersTool = createTool({
  id: 'get-most-diverse-recommenders',
  description: 'Find people who recommend across the most genres',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    recommenders: z.array(z.object({
      person_id: z.string(),
      full_name: z.string(),
      genre_count: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_most_diverse_recommenders', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { recommenders: data };
  }
});

// Tool to find books recommended by the widest variety of types
export const getBooksWithMostTypeDiversityTool = createTool({
  id: 'get-books-with-most-type-diversity',
  description: 'Find books recommended by the widest variety of types',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    books: z.array(z.object({
      book_id: z.string(),
      title: z.string(),
      type_count: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_books_with_most_type_diversity', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { books: data };
  }
});

// Tool to find which genres are recommended by the most unique people
export const getTopGenresByRecommendersTool = createTool({
  id: 'get-top-genres-by-recommenders',
  description: 'Find which genres are recommended by the most unique people',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    genres: z.array(z.object({
      genre: z.string(),
      unique_recommenders: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_top_genres_by_recommenders', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { genres: data };
  }
});

// Tool to analyze genre overlap: avg books per recommender and vice versa
export const getGenreOverlapStatsTool = createTool({
  id: 'get-genre-overlap-stats',
  description: 'Analyze genre overlap: avg books per recommender and vice versa',
  inputSchema: z.object({}),
  outputSchema: z.object({
    stats: z.array(z.object({
      genre: z.string(),
      avg_books_per_recommender: z.number(),
      avg_recommenders_per_book: z.number()
    }))
  }),
  execute: async () => {
    const { data, error } = await supabase.rpc('get_genre_overlap_stats');
    if (error) throw new Error(error.message);
    return { stats: data };
  }
});

// Tool to get recommendation counts per book (for popularity or power-law analysis)
export const getRecommendationDistributionTool = createTool({
  id: 'get-recommendation-distribution',
  description: 'Get recommendation counts per book (for popularity or power-law analysis)',
  inputSchema: z.object({}),
  outputSchema: z.object({
    distribution: z.array(z.object({
      book_id: z.string(),
      title: z.string(),
      recommendation_count: z.number()
    }))
  }),
  execute: async () => {
    const { data, error } = await supabase.rpc('get_recommendation_distribution');
    if (error) throw new Error(error.message);
    return { distribution: data };
  }
});

// Tool to find books that are recommended by the most people overall
export const getMostRecommendedBooksTool = createTool({
  id: 'get-most-recommended-books',
  description: 'Find books that are recommended by the most people overall',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    books: z.array(z.object({
      book_id: z.string(),
      title: z.string(),
      recommendation_count: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_most_recommended_books', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { books: data };
  }
});

// Tool to find people whose book recs show up most in other people’s lists (influence score)
export const getInfluentialRecommendersTool = createTool({
  id: 'get-influential-recommenders',
  description: 'Find people whose book recs show up most in other people’s lists (influence score)',
  inputSchema: z.object({ limit: z.number().default(10) }),
  outputSchema: z.object({
    influencers: z.array(z.object({
      person_id: z.string(),
      full_name: z.string(),
      influence_score: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_influential_recommenders', { limit_arg: context.limit });
    if (error) throw new Error(error.message);
    return { influencers: data };
  }
});

// Tool to find the top 3 people with the most similar description-based book taste to a given person
export const getSimilarPeopleByDescriptionEmbeddingTool = createTool({
  id: 'get-similar-people-by-description-embedding',
  description: 'Find the top 3 people with the most similar description-based book taste to a given person',
  inputSchema: z.object({
    person_id: z.string()
  }),
  outputSchema: z.object({
    people: z.array(z.object({
      person_id: z.string(),
      full_name: z.string(),
      type: z.string().nullable(),
      similarity: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_similar_people_by_description_embedding', {
      person_id_arg: context.person_id
    });
    if (error) throw new Error(error.message);
    return { people: data };
  }
});

// Tool to find the top 3 books most similar in description to a given book
export const getSimilarBooksToBookByDescriptionTool = createTool({
  id: 'get-similar-books-to-book-by-description',
  description: 'Find the top 3 books most similar in description to a given book',
  inputSchema: z.object({
    book_id: z.string()
  }),
  outputSchema: z.object({
    books: z.array(z.object({
      id: z.string(),
      title: z.string(),
      author: z.string(),
      genre: z.array(z.string()),
      description: z.string().nullable(),
      amazon_url: z.string().nullable(),
      similarity: z.number()
    }))
  }),
  execute: async ({ context }) => {
    const { data, error } = await supabase.rpc('get_similar_books_to_book_by_description', {
      book_id_arg: context.book_id
    });
    if (error) throw new Error(error.message);
    return { books: data };
  }
});


