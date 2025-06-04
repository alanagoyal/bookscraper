import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import { supabase } from '../services/supabase.ts';

const concurrency = 10;
const limit = pLimit(concurrency);

async function convertBookPercentilesToDecimal() {
  console.log('📚 Converting book percentiles to decimal format...');
  
  // Get all books with their current percentile values
  const { data: books, error } = await supabase
    .from('books')
    .select('id, recommendation_percentile')
    .not('recommendation_percentile', 'is', null);

  if (error || !books) {
    console.error('Error fetching books:', error);
    return;
  }

  console.log(`📊 Books to convert: ${books.length}`);

  const bar = new cliProgress.SingleBar({
    format: '📚 Books   [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(books.length, 0);

  const tasks = books.map(book =>
    limit(async () => {
      try {
        // Convert from 0-100 to 0.0-1.0
        const decimalPercentile = book.recommendation_percentile / 100;
        
        const { error } = await supabase
          .from('books')
          .update({ recommendation_percentile: decimalPercentile })
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
  console.log(`✅ Converted ${books.length} book percentiles to decimal format`);
}

async function convertPeoplePercentilesToDecimal() {
  console.log('\n👤 Converting people percentiles to decimal format...');
  
  // Get all people with their current percentile values
  const { data: people, error } = await supabase
    .from('people')
    .select('id, recommendation_percentile')
    .not('recommendation_percentile', 'is', null);

  if (error || !people) {
    console.error('Error fetching people:', error);
    return;
  }

  console.log(`📊 People to convert: ${people.length}`);

  const bar = new cliProgress.SingleBar({
    format: '👤 People  [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(people.length, 0);

  const tasks = people.map(person =>
    limit(async () => {
      try {
        // Convert from 0-100 to 0.0-1.0
        const decimalPercentile = person.recommendation_percentile / 100;
        
        const { error } = await supabase
          .from('people')
          .update({ recommendation_percentile: decimalPercentile })
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
  console.log(`✅ Converted ${people.length} people percentiles to decimal format`);
}

async function main() {
  console.log('🚀 Converting percentiles from integer (0-100) to decimal (0.0-1.0)...');
  console.log('=' .repeat(60));
  await convertBookPercentilesToDecimal();
  await convertPeoplePercentilesToDecimal();
  console.log('\n' + '=' .repeat(60));
  console.log('✅ All percentiles converted to decimal format.');
}

main().catch((err) => {
  console.error('❗ Unexpected error:', err);
});
