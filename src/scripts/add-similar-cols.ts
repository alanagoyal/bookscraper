import pLimit from 'p-limit';
import cliProgress from 'cli-progress';
import { supabase } from '../services/supabase.ts';

const concurrency = 10;
const limit = pLimit(concurrency);

async function updateSimilarBooks() {
  // First, get all books to check their IDs
  const { data: allBookIds, error: allBooksError } = await supabase
    .from('books')
    .select('id');

  if (allBooksError || !allBookIds) {
    console.error('Error fetching all book IDs:', allBooksError);
    return;
  }

  console.log(`📊 Total books in database: ${allBookIds.length}`);
  const existingBookIds = new Set(allBookIds.map(b => b.id));

  // Get books with similar_books that need checking
  const { data: booksWithSimilar, error } = await supabase
    .from('books')
    .select('id, similar_books')
    .not('similar_books', 'is', null)
    .not('description_embedding', 'is', null);

  if (error || !booksWithSimilar) {
    console.error('Error fetching books:', error);
    return;
  }

  console.log(`📚 Books with similar_books column populated: ${booksWithSimilar.length}`);

  // Filter books that have similar_books with IDs not in database
  const booksToUpdate = booksWithSimilar.filter((book: any) => {
    if (!book.similar_books || !Array.isArray(book.similar_books)) return false;
    
    return book.similar_books.some((similarBook: any) => {
      const similarId = similarBook?.id;
      return similarId && !existingBookIds.has(similarId);
    });
  });

  console.log(`🔍 Books with missing similar book references: ${booksToUpdate.length}`);
  
  if (booksToUpdate.length > 0) {
    // Log some example missing references
    const exampleBook = booksToUpdate[0];
    const missingIds = exampleBook.similar_books
      .filter((sb: any) => sb?.id && !existingBookIds.has(sb.id))
      .map((sb: any) => sb.id)
      .slice(0, 3);
    console.log(`   Example missing IDs from book ${exampleBook.id}: ${missingIds.join(', ')}${missingIds.length < exampleBook.similar_books.filter((sb: any) => sb?.id && !existingBookIds.has(sb.id)).length ? '...' : ''}`);
  }

  if (booksToUpdate.length === 0) {
    console.log('✅ No books need updating');
    return;
  }

  const bar = new cliProgress.SingleBar({
    format: '📚 Books   [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(booksToUpdate.length, 0);

  const tasks = booksToUpdate.map((book: any) =>
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
  console.log(`✅ Updated ${booksToUpdate.length} books`);
}

async function updateSimilarPeople() {
  // First, get all people to check their IDs
  const { data: allPeopleIds, error: allPeopleError } = await supabase
    .from('people')
    .select('id');

  if (allPeopleError || !allPeopleIds) {
    console.error('Error fetching all people IDs:', allPeopleError);
    return;
  }

  console.log(`\n📊 Total people in database: ${allPeopleIds.length}`);
  const existingPeopleIds = new Set(allPeopleIds.map(p => p.id));

  // Get people with similar_people that need checking
  const { data: peopleWithSimilar, error } = await supabase
    .from('people')
    .select('id, similar_people')
    .not('similar_people', 'is', null)
    .not('description_embedding', 'is', null);

  if (error || !peopleWithSimilar) {
    console.error('Error fetching people:', error);
    return;
  }

  console.log(`👤 People with similar_people column populated: ${peopleWithSimilar.length}`);

  // Filter people that have similar_people with IDs not in database
  const peopleToUpdate = peopleWithSimilar.filter((person: any) => {
    if (!person.similar_people || !Array.isArray(person.similar_people)) return false;
    
    return person.similar_people.some((similarPerson: any) => {
      const similarId = similarPerson?.id;
      return similarId && !existingPeopleIds.has(similarId);
    });
  });

  console.log(`🔍 People with missing similar people references: ${peopleToUpdate.length}`);
  
  if (peopleToUpdate.length > 0) {
    // Log some example missing references
    const examplePerson = peopleToUpdate[0];
    const missingIds = examplePerson.similar_people
      .filter((sp: any) => sp?.id && !existingPeopleIds.has(sp.id))
      .map((sp: any) => sp.id)
      .slice(0, 3);
    console.log(`   Example missing IDs from person ${examplePerson.id}: ${missingIds.join(', ')}${missingIds.length < examplePerson.similar_people.filter((sp: any) => sp?.id && !existingPeopleIds.has(sp.id)).length ? '...' : ''}`);
  }

  if (peopleToUpdate.length === 0) {
    console.log('✅ No people need updating');
    return;
  }

  const bar = new cliProgress.SingleBar({
    format: '👤 People  [{bar}] {value}/{total} | ETA: {eta_formatted}',
    clearOnComplete: true,
  }, cliProgress.Presets.shades_classic);

  bar.start(peopleToUpdate.length, 0);

  const tasks = peopleToUpdate.map((person: any) =>
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
  console.log(`✅ Updated ${peopleToUpdate.length} people`);
}

async function main() {
  console.log('🚀 Updating similar books and people with missing references...');
  console.log('=' .repeat(60));
  await updateSimilarBooks();
  await updateSimilarPeople();
  console.log('\n' + '=' .repeat(60));
  console.log('✅ All similarities updated.');
}

main().catch((err) => {
  console.error('❗ Unexpected error:', err);
});
