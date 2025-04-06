import { supabase } from "../services/supabase.js";

interface Book {
  id: string;
  title: string;
  author: string;
}

async function searchOpenLibrary(title: string, author: string) {
  try {
    const query = `${title} ${author}`.replace(/\s+/g, "+");
    const response = await fetch(
      `https://openlibrary.org/search.json?q=${query}&fields=key,isbn`
    );
    const data = await response.json();
    
    if (data.docs && data.docs.length > 0) {
      const book = data.docs[0];
      return {
        olid: book.key?.split("/")?.pop(),
        isbn: book.isbn?.[0],
      };
    }
    return null;
  } catch (error) {
    console.error(`Error searching for book: ${title}`, error);
    return null;
  }
}

async function getCoverUrl(identifier: string, type: "isbn" | "olid") {
  const size = "L"; // Large size cover
  return `https://covers.openlibrary.org/b/${type}/${identifier}-${size}.jpg`;
}

async function main() {
  // Get all books from the database
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author");

  if (error) {
    console.error("Error fetching books:", error);
    return;
  }

  let foundCount = 0;
  let notFoundCount = 0;

  for (const book of books) {
    console.log(`\nProcessing: ${book.title} by ${book.author}`);
    
    // Search for book identifiers
    const identifiers = await searchOpenLibrary(book.title, book.author);
    
    if (!identifiers) {
      console.log(`❌ No identifiers found for: ${book.title}`);
      notFoundCount++;
      continue;
    }

    // Log cover URLs if found
    if (identifiers.isbn) {
      console.log(`📚 ISBN Cover URL: ${await getCoverUrl(identifiers.isbn, "isbn")}`);
      foundCount++;
    } else if (identifiers.olid) {
      console.log(`📚 OLID Cover URL: ${await getCoverUrl(identifiers.olid, "olid")}`);
      foundCount++;
    } else {
      console.log(`❌ No cover found for: ${book.title}`);
      notFoundCount++;
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n📊 Summary:");
  console.log(`✅ Found covers: ${foundCount}`);
  console.log(`❌ No covers found: ${notFoundCount}`);
}

main().catch(console.error);
