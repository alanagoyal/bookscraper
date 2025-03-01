import { generateGenreAndDescription, getSourceName } from './main.ts';

async function runTests() {
  console.log('Running Source Name Tests...\n');
  await testGetSourceName();
  
  console.log('\nRunning Genre Description Tests...\n');
  await testGenerateGenreAndDescription();
}

async function testGenerateGenreAndDescription() {
  try {
    // Test case 1
    console.log('Testing with "The Great Gatsby" by F. Scott Fitzgerald');
    const result1 = await generateGenreAndDescription('The Great Gatsby', 'F. Scott Fitzgerald');
    console.log('Result:', result1, '\n');

    // Test case 2
    console.log('Testing with "1984" by George Orwell');
    const result2 = await generateGenreAndDescription('1984', 'George Orwell');
    console.log('Result:', result2);
  } catch (error) {
    console.error('Genre/Description test failed:', error);
  }
}

async function testGetSourceName() {
  try {
    // Test case 1: Testing with a news website
    console.log('Testing source name extraction from news website');
    const result1 = await getSourceName('https://www.nytimes.com/books/best-sellers/');
    console.log('Result:', result1, '\n');

    // Test case 2: Testing with a blog
    console.log('Testing source name extraction from blog');
    const result2 = await getSourceName('https://medium.com/@username/book-recommendations');
    console.log('Result:', result2, '\n');

    // Test case 3: Testing with a book platform
    console.log('Testing source name extraction from book platform');
    const result3 = await getSourceName('https://www.goodreads.com/list/show/1.Best_Books_Ever');
    console.log('Result:', result3);

  } catch (error) {
    console.error('Source name test failed:', error);
  }
}

// Run all tests
runTests();
