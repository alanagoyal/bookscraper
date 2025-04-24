
import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import { supabase } from '../services/supabase.ts';

const concurrency = 10;
const limit = pLimit(concurrency);

async function updateSimilarBooks() {
  const { data: books, error } = await supabase
    .from('books')
    .select('id')
    .not('description_embedding', 'is', null);

  if (error || !books) {
    console.error('Error fetching books:', error);
    return;
  }

  const bar = new cliProgress.SingleBar({
    format: '📚 Books   [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(books.length, 0);

  const tasks = books.map((book) =>
    limit(async () => {
      try {
        const { data, error } = await supabase.rpc(
          'get_similar_books_to_book_by_description',
          { book_id_arg: book.id }
        );

        if (!error) {
          await supabase
            .from('books')
            .update({ similar_books: data })
            .eq('id', book.id);
        } else {
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
}

async function updateSimilarPeople() {
  const { data: people, error } = await supabase.from('people').select('id');

  if (error || !people) {
    console.error('Error fetching people:', error);
    return;
  }

  const bar = new cliProgress.SingleBar({
    format: '👤 People  [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(people.length, 0);

  const tasks = people.map((person) =>
    limit(async () => {
      try {
        const { data, error } = await supabase.rpc(
          'get_similar_people_by_description_embedding',
          { person_id_arg: person.id }
        );

        if (!error) {
          await supabase
            .from('people')
            .update({ similar_people: data })
            .eq('id', person.id);
        } else {
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
}

async function main() {
  console.log('🚀 Updating similar books and people...');
  await updateSimilarBooks();
  await updateSimilarPeople();
  console.log('✅ All similarities updated.');
}

main().catch((err) => {
  console.error('❗ Unexpected error:', err);
});
