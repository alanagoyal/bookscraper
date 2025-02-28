import { generateGenreAndDescription } from './main.ts';

async function testGenerateGenreAndDescription() {
  try {
    // Test case 1
    console.log('Testing with "The Great Gatsby" by F. Scott Fitzgerald');
    const result1 = await generateGenreAndDescription('The Great Gatsby', 'F. Scott Fitzgerald');
    console.log('Result 1:', result1);

    // Test case 2
    console.log('\nTesting with "1984" by George Orwell');
    const result2 = await generateGenreAndDescription('1984', 'George Orwell');
    console.log('Result 2:', result2);
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testGenerateGenreAndDescription();
