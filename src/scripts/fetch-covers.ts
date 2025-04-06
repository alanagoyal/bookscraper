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

async function checkCoverExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}?default=false`);
    return response.ok;
  } catch (error) {
    console.error(`Error checking cover at ${url}:`, error);
    return false;
  }
}

async function getCoverUrl(identifier: string, type: "isbn" | "olid"): Promise<string | null> {
  const size = "M"; // Medium size cover
  const url = `https://covers.openlibrary.org/b/${type}/${identifier}-${size}.jpg`;
  const exists = await checkCoverExists(url);
  return exists ? url : null;
}

async function main() {
  console.log("Fetching books from database...");
  
  // Get all books from the database
  const { data: books, error } = await supabase
    .from("books")
    .select("id, title, author")
    .is("cover_url", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching books:", error);
    return;
  }

  console.log(`Found ${books?.length || 0} books in database`);

  if (!books || books.length === 0) {
    console.error("No books found in database");
    return;
  }

  let foundCount = 0;
  let notFoundCount = 0;

  for (const book of books) {
    console.log(`\nProcessing: ${book.title} by ${book.author}`);
    
    // Search for book identifiers
    const identifiers = await searchOpenLibrary(book.title, book.author);
    console.log("Identifiers found:", identifiers);
    
    if (!identifiers) {
      console.log(`❌ No identifiers found for: ${book.title}`);
      notFoundCount++;
      
      // Update database with null cover_url
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: null })
        .eq("id", book.id);

      if (updateError) {
        console.error("Error updating database:", updateError);
      }
        
      continue;
    }

    // Try ISBN first, then fall back to OLID
    let coverUrl = null;
    if (identifiers.isbn) {
      coverUrl = await getCoverUrl(identifiers.isbn, "isbn");
      if (coverUrl) {
        console.log(`📚 Found ISBN cover: ${coverUrl}`);
      }
    }
    
    if (!coverUrl && identifiers.olid) {
      coverUrl = await getCoverUrl(identifiers.olid, "olid");
      if (coverUrl) {
        console.log(`📚 Found OLID cover: ${coverUrl}`);
      }
    }

    // Update database
    if (coverUrl) {
      foundCount++;
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: coverUrl })
        .eq("id", book.id);

      if (updateError) {
        console.error("Error updating database:", updateError);
      }
    } else {
      notFoundCount++;
      console.log(`❌ No cover found for: ${book.title}`);
      const { error: updateError } = await supabase
        .from("books")
        .update({ cover_url: null })
        .eq("id", book.id);

      if (updateError) {
        console.error("Error updating database:", updateError);
      }
    }

    // Add a small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log("\n📊 Summary:");
  console.log(`✅ Found covers: ${foundCount}`);
  console.log(`❌ No covers found: ${notFoundCount}`);
}

main().catch(console.error);
