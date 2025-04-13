import { initLogger, invoke } from 'braintrust';
import { supabase } from '../services/supabase.ts';
import fs from 'fs'

// Initialize Braintrust logger
initLogger({
    projectName: "booklist",
    apiKey: process.env.BRAINTRUST_API_KEY,
  });
  
interface Book {
  title: string;
  author: string;
  genre: string[];
}

interface Person {
  full_name: string;
  type: string;
}

interface Recommendation {
  book: Book;
  person: Person;
  created_at: string;
}

interface TotalCounts {
  total_books: number;
  total_recommenders: number;
  total_recommendations: number;
}

interface TopBook {
  title: string;
  author: string;
  genre: string[];
  rec_count: number;
  recommenders: string[];
}

interface TopRecommender {
  full_name: string;
  rec_count: number;
  genres: string[];
}

interface GenreDistribution {
  genre: string;
  count: number;
}

interface BookRecommenderOverlap {
  title: string;
  recommenders: string[];
}

interface RecommenderSimilarity {
  person_a: string;
  person_b: string;
  shared_books: number;
}

interface BooksByRecommenderType {
  title: string;
  distinct_types: number;
  types: string[];
}

interface HiddenGem {
  title: string;
  rec_count: number;
  recommenders: string[];
}

interface MonthlyTrend {
  month: string;
  trends: Record<string, number>;
}

async function analyzeJson(data: Record<string, any>) {
    const compactData = {
        totalCounts: data.totalCounts,
        topBooks: data.topBooks.slice(0, 10),
        topRecommenders: data.topRecommenders.slice(0, 10),
        genreDistribution: data.genreDistribution.slice(0, 10),
        bookRecommenderOverlap: data.bookRecommenderOverlap.slice(0, 10),
        recommenderSimilarity: data.recommenderSimilarity.slice(0, 10),
        booksByRecommenderType: data.booksByRecommenderType.slice(0, 10),
        hiddenGems: data.hiddenGems.slice(0, 10),
        monthlyTrends: data.monthlyTrends.slice(0, 6)
    };

    const result = await invoke({
        projectName: "booklist",
        slug: "analysis-99f3",
        input: { json: JSON.stringify(compactData) },
    });
    return result;
}

async function run() {
  const queries = {
    totalCounts: async (): Promise<TotalCounts> => {
      const books = await supabase.from('books').select('*', { count: 'exact', head: true });
      const people = await supabase.from('people').select('*', { count: 'exact', head: true });
      const recommendations = await supabase.from('recommendations').select('*', { count: 'exact', head: true });
      
      if (!books.count || !people.count || !recommendations.count) {
        throw new Error('Failed to get counts');
      }

      return {
        total_books: books.count,
        total_recommenders: people.count,
        total_recommendations: recommendations.count
      };
    },
    topBooks: async (): Promise<TopBook[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          book:books(
            title,
            author,
            genre
          ),
          person:people(
            full_name
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const bookCounts = data.reduce((acc: Record<string, {
        title: string;
        author: string;
        genre: string[];
        rec_count: number;
        recommenders: Set<string>;
      }>, rec) => {
        const bookTitle = rec.book.title;
        if (!acc[bookTitle]) {
          acc[bookTitle] = {
            title: rec.book.title,
            author: rec.book.author,
            genre: rec.book.genre,
            rec_count: 0,
            recommenders: new Set()
          };
        }
        acc[bookTitle].rec_count++;
        acc[bookTitle].recommenders.add(rec.person.full_name);
        return acc;
      }, {});

      return Object.values(bookCounts)
        .map(book => ({
          ...book,
          recommenders: Array.from(book.recommenders)
        }))
        .sort((a, b) => b.rec_count - a.rec_count)
        .slice(0, 20);
    },
    topRecommenders: async (): Promise<TopRecommender[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          person:people(
            full_name,
            type
          ),
          book:books(
            genre
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const recommenderCounts = data.reduce((acc: Record<string, {
        full_name: string;
        rec_count: number;
        genres: Set<string>;
      }>, rec) => {
        const recommenderName = rec.person.full_name;
        if (!acc[recommenderName]) {
          acc[recommenderName] = {
            full_name: rec.person.full_name,
            rec_count: 0,
            genres: new Set()
          };
        }
        acc[recommenderName].rec_count++;
        rec.book.genre.forEach((genre: string) => acc[recommenderName].genres.add(genre));
        return acc;
      }, {});

      return Object.values(recommenderCounts)
        .map(recommender => ({
          ...recommender,
          genres: Array.from(recommender.genres)
        }))
        .sort((a, b) => b.rec_count - a.rec_count)
        .slice(0, 20);
    },
    genreDistribution: async (): Promise<GenreDistribution[]> => {
      const { data, error } = await supabase
        .from('books')
        .select('genre') as { data: Book[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const genreCounts = data.reduce((acc: Record<string, number>, book) => {
        book.genre.forEach((genre: string) => {
          if (!acc[genre]) {
            acc[genre] = 0;
          }
          acc[genre]++;
        });
        return acc;
      }, {});

      return Object.entries(genreCounts)
        .map(([genre, count]) => ({ genre, count }))
        .sort((a, b) => b.count - a.count);
    },
    bookRecommenderOverlap: async (): Promise<BookRecommenderOverlap[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          book:books(
            title
          ),
          person:people(
            full_name
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const bookRecommenders = data.reduce((acc: Record<string, Set<string>>, rec) => {
        const bookTitle = rec.book.title;
        if (!acc[bookTitle]) {
          acc[bookTitle] = new Set();
        }
        acc[bookTitle].add(rec.person.full_name);
        return acc;
      }, {});

      return Object.entries(bookRecommenders)
        .filter(([bookTitle, recommenders]) => recommenders.size > 1)
        .map(([bookTitle, recommenders]) => ({ title: bookTitle, recommenders: Array.from(recommenders) }))
        .sort((a, b) => b.recommenders.length - a.recommenders.length)
        .slice(0, 50);
    },
    recommenderSimilarity: async (): Promise<RecommenderSimilarity[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          person:people(
            full_name
          ),
          book:books(
            title
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const recommenderBooks = data.reduce((acc: Record<string, Set<string>>, rec) => {
        const recommenderName = rec.person.full_name;
        if (!acc[recommenderName]) {
          acc[recommenderName] = new Set();
        }
        acc[recommenderName].add(rec.book.title);
        return acc;
      }, {});

      const similarities = [];
      for (const [recommenderA, booksA] of Object.entries(recommenderBooks)) {
        for (const [recommenderB, booksB] of Object.entries(recommenderBooks)) {
          if (recommenderA !== recommenderB) {
            const sharedBooks = [...booksA].filter(book => booksB.has(book));
            if (sharedBooks.length > 2) {
              similarities.push({
                person_a: recommenderA,
                person_b: recommenderB,
                shared_books: sharedBooks.length
              });
            }
          }
        }
      }

      return similarities
        .sort((a, b) => b.shared_books - a.shared_books)
        .slice(0, 100);
    },
    booksByRecommenderType: async (): Promise<BooksByRecommenderType[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          book:books(
            title
          ),
          person:people(
            type
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const bookTypes = data.reduce((acc: Record<string, Set<string>>, rec) => {
        const bookTitle = rec.book.title;
        if (!acc[bookTitle]) {
          acc[bookTitle] = new Set();
        }
        acc[bookTitle].add(rec.person.type);
        return acc;
      }, {});

      return Object.entries(bookTypes)
        .map(([bookTitle, types]) => ({ title: bookTitle, distinct_types: types.size, types: Array.from(types) }))
        .sort((a, b) => b.distinct_types - a.distinct_types)
        .slice(0, 20);
    },
    hiddenGems: async (): Promise<HiddenGem[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          book:books(
            title
          ),
          person:people(
            full_name
          )
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const bookRecommenders = data.reduce((acc: Record<string, Set<string>>, rec) => {
        const bookTitle = rec.book.title;
        if (!acc[bookTitle]) {
          acc[bookTitle] = new Set();
        }
        acc[bookTitle].add(rec.person.full_name);
        return acc;
      }, {});

      return Object.entries(bookRecommenders)
        .filter(([bookTitle, recommenders]) => recommenders.size <= 2)
        .map(([bookTitle, recommenders]) => ({ title: bookTitle, rec_count: recommenders.size, recommenders: Array.from(recommenders) }))
        .sort((a, b) => b.rec_count - a.rec_count)
        .slice(0, 50);
    },
    monthlyTrends: async (): Promise<MonthlyTrend[]> => {
      const { data, error } = await supabase
        .from('recommendations')
        .select(`
          book:books(
            title
          ),
          created_at
        `) as { data: Recommendation[] | null, error: Error | null };
      
      if (error) throw error;
      if (!data) throw new Error('No data returned');
      
      const monthlyTrends = data.reduce((acc: Record<string, Record<string, number>>, rec) => {
        const month = new Date(rec.created_at).toISOString().slice(0, 7);
        if (!acc[month]) {
          acc[month] = {};
        }
        if (!acc[month][rec.book.title]) {
          acc[month][rec.book.title] = 0;
        }
        acc[month][rec.book.title]++;
        return acc;
      }, {});

      return Object.entries(monthlyTrends)
        .map(([month, trends]) => ({ month, trends }))
        .sort((a, b) => b.month.localeCompare(a.month));
    }
  }

  const results: Record<string, any> = {}

  for (const [key, queryFn] of Object.entries(queries)) {
    try {
      results[key] = await queryFn();
      console.log(`✅ Successfully fetched ${key}`);
    } catch (error) {
      console.error(`Error fetching ${key}:`, error);
    }
  }

  // Write initial results to summary file
  fs.writeFileSync('book_recommendation_summary.json', JSON.stringify(results, null, 2));
  console.log('✅ Summary written to book_recommendation_summary.json');

  // Read and parse the JSON file
  const jsonContent = JSON.parse(fs.readFileSync('book_recommendation_summary.json', 'utf-8'));
  
  // Analyze the complete dataset (but with reduced size)
  const analysisResult = await analyzeJson(jsonContent);
  
  // Write analysis results to a new file
  fs.writeFileSync('book_recommendation_analysis.json', JSON.stringify(analysisResult, null, 2));
  console.log('✅ Analysis written to book_recommendation_analysis.json');
}

run().catch(console.error);
