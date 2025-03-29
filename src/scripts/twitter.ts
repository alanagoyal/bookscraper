import { supabase } from '../services/supabase.ts';
import { sanitizeTwitterUrl } from '../utils/social.ts';
import chalk from 'chalk';

// To run: npx tsx twitter.ts
async function sanitizeTwitterUrls() {
  console.log(chalk.blue('Starting Twitter URL sanitization...'));

  // Get all records with Twitter URLs
  const { data: people, error } = await supabase
    .from('people')
    .select('id, full_name, url')
    .or('url.ilike.%twitter.com%,url.ilike.%x.com%')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(chalk.red('Error fetching records:', error.message));
    throw error;
  }

  if (!people || people.length === 0) {
    console.log(chalk.yellow('No Twitter URLs found to sanitize.'));
    return;
  }

  console.log(chalk.blue(`Found ${people.length} records with Twitter URLs to process.`));

  // Process each record
  for (const person of people) {
    const sanitizedUrl = sanitizeTwitterUrl(person.url);
    
    if (sanitizedUrl !== person.url) {
      console.log(chalk.cyan(`Updating ${person.full_name}:`));
      console.log(chalk.gray(`  Old URL: ${person.url}`));
      console.log(chalk.green(`  New URL: ${sanitizedUrl}`));

      const { error: updateError } = await supabase
        .from('people')
        .update({ url: sanitizedUrl })
        .eq('id', person.id);

      if (updateError) {
        console.error(chalk.red(`Error updating ${person.full_name}:`, updateError.message));
      }
    } else {
      console.log(chalk.gray(`No changes needed for ${person.full_name}`));
    }
  }

  console.log(chalk.green('\nTwitter URL sanitization complete!'));
}

sanitizeTwitterUrls().catch(console.error);
