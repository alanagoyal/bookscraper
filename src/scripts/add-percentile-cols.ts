import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import { supabase } from '../services/supabase.ts';

const concurrency = 10;
const limit = pLimit(concurrency);

async function updateBookPercentiles() {
  console.log('📚 Calculating book recommendation percentiles...');
  
  // Get recommendation counts for all books
  const { data: bookCounts, error: countError } = await supabase
    .from('recommendations')
    .select('book_id')
    .not('book_id', 'is', null);

  if (countError || !bookCounts) {
    console.error('Error fetching book recommendations:', countError);
    return;
  }

  // Count occurrences for each book
  const bookCountMap = new Map<string, number>();
  bookCounts.forEach(rec => {
    const count = bookCountMap.get(rec.book_id) || 0;
    bookCountMap.set(rec.book_id, count + 1);
  });

  // Get all books
  const { data: allBooks, error: booksError } = await supabase
    .from('books')
    .select('id');

  if (booksError || !allBooks) {
    console.error('Error fetching books:', booksError);
    return;
  }

  console.log(`📊 Total books: ${allBooks.length}`);
  console.log(`📊 Books with recommendations: ${bookCountMap.size}`);

  // Create array of counts for all books (including 0 for books with no recommendations)
  const allCounts: number[] = allBooks.map(book => bookCountMap.get(book.id) || 0);
  allCounts.sort((a, b) => a - b);

  // Calculate percentile for each book
  const bookPercentiles = new Map<string, number>();
  allBooks.forEach(book => {
    const count = bookCountMap.get(book.id) || 0;
    // Find position in sorted array
    const position = allCounts.findIndex(c => c > count);
    const percentile = position === -1 
      ? 1.0 // If no count is greater, this is the 100th percentile (1.0 in decimal)
      : position / allCounts.length; // Return as decimal (0.0-1.0)
    bookPercentiles.set(book.id, percentile);
  });

  // Update books in batches
  const bar = new cliProgress.SingleBar({
    format: '📚 Books   [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(allBooks.length, 0);

  const tasks = allBooks.map(book =>
    limit(async () => {
      try {
        const percentile = bookPercentiles.get(book.id) || 0;
        const { error } = await supabase
          .from('books')
          .update({ recommendation_percentile: percentile })
          .eq('id', book.id);

        if (error) {
          console.error(`❌ Book ${book.id}:`, error.message);
        }
      } catch (err) {
        console.error(`🔥 Book ${book.id} failed:`, err);
      } finally {
        bar.increment();
      }
    })
  );

  await Promise.all(tasks);
  bar.stop();
  
  // Log some statistics
  const topBooks = Array.from(bookCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log('\n📈 Top 5 most recommended books:');
  topBooks.forEach(([bookId, count], index) => {
    const percentile = bookPercentiles.get(bookId);
    console.log(`   ${index + 1}. Book ${bookId}: ${count} recommendations (${(percentile! * 100).toFixed(1)}th percentile)`);
  });
  
  console.log(`✅ Updated ${allBooks.length} book percentiles`);
}

async function updatePeoplePercentiles() {
  console.log('\n👤 Calculating people recommendation percentiles...');
  
  // Get recommendation counts for all people
  const { data: personCounts, error: countError } = await supabase
    .from('recommendations')
    .select('person_id')
    .not('person_id', 'is', null);

  if (countError || !personCounts) {
    console.error('Error fetching person recommendations:', countError);
    return;
  }

  // Count occurrences for each person
  const personCountMap = new Map<string, number>();
  personCounts.forEach(rec => {
    const count = personCountMap.get(rec.person_id) || 0;
    personCountMap.set(rec.person_id, count + 1);
  });

  // Get all people
  const { data: allPeople, error: peopleError } = await supabase
    .from('people')
    .select('id');

  if (peopleError || !allPeople) {
    console.error('Error fetching people:', peopleError);
    return;
  }

  console.log(`📊 Total people: ${allPeople.length}`);
  console.log(`📊 People with recommendations: ${personCountMap.size}`);

  // Create array of counts for all people (including 0 for people with no recommendations)
  const allCounts: number[] = allPeople.map(person => personCountMap.get(person.id) || 0);
  allCounts.sort((a, b) => a - b);

  // Calculate percentile for each person
  const personPercentiles = new Map<string, number>();
  allPeople.forEach(person => {
    const count = personCountMap.get(person.id) || 0;
    // Find position in sorted array
    const position = allCounts.findIndex(c => c > count);
    const percentile = position === -1 
      ? 1.0 // If no count is greater, this is the 100th percentile (1.0 in decimal)
      : position / allCounts.length; // Return as decimal (0.0-1.0)
    personPercentiles.set(person.id, percentile);
  });

  // Update people in batches
  const bar = new cliProgress.SingleBar({
    format: '👤 People  [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(allPeople.length, 0);

  const tasks = allPeople.map(person =>
    limit(async () => {
      try {
        const percentile = personPercentiles.get(person.id) || 0;
        const { error } = await supabase
          .from('people')
          .update({ recommendation_percentile: percentile })
          .eq('id', person.id);

        if (error) {
          console.error(`❌ Person ${person.id}:`, error.message);
        }
      } catch (err) {
        console.error(`🔥 Person ${person.id} failed:`, err);
      } finally {
        bar.increment();
      }
    })
  );

  await Promise.all(tasks);
  bar.stop();
  
  // Log some statistics
  const topPeople = Array.from(personCountMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  
  console.log('\n📈 Top 5 people with most recommendations:');
  topPeople.forEach(([personId, count], index) => {
    const percentile = personPercentiles.get(personId);
    console.log(`   ${index + 1}. Person ${personId}: ${count} recommendations (${(percentile! * 100).toFixed(1)}th percentile)`);
  });
  
  console.log(`✅ Updated ${allPeople.length} people percentiles`);
}

async function main() {
  console.log('🚀 Calculating recommendation percentiles...');
  console.log('=' .repeat(60));
  await updateBookPercentiles();
  await updatePeoplePercentiles();
  console.log('\n' + '=' .repeat(60));
  console.log('✅ All percentiles calculated and updated.');
}

main().catch((err) => {
  console.error('❗ Unexpected error:', err);
});