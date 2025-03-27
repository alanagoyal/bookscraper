import StagehandConfig from "../../stagehand.config.js";
import { Stagehand } from "@browserbasehq/stagehand";
import { supabase } from '../services/supabase.ts';
import { findSocialUrl } from '../utils/social.ts';
import chalk from 'chalk';

// To run: npx tsx social.ts
async function getPeople() {
  const { data: people, error } = await supabase
    .from('people')
    .select('id, full_name, type, url')
    .is('url', null)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return people;
}

async function updatePersonSocialUrl(id: string, socialUrl: string) {
  console.log(chalk.blue('Attempting to update database with:'), {
    id,
    socialUrl,
  });

  // First verify we can read from the database
  const { data: person, error: readError } = await supabase
    .from('people')
    .select('full_name')
    .eq('id', id)
    .single();

  if (readError) {
    console.error(chalk.red('Error reading from database:'), readError);
    throw readError;
  }

  console.log(chalk.blue('Found person:'), person);

  // Now update the record
  const { error: updateError } = await supabase
    .from('people')
    .update({ url: socialUrl })
    .eq('id', id);

  if (updateError) {
    console.error(chalk.red('Error updating database:'), updateError);
    throw updateError;
  }

  console.log(chalk.green('Successfully updated database'));
}

async function run() {
  try {
    const stagehand = new Stagehand(StagehandConfig);
    await stagehand.init();
    const page = stagehand.page;

    const people = await getPeople();
    console.log(chalk.blue(`Found ${people.length} people without social URLs`));

    for (const person of people) {
      console.log(chalk.green(`\nProcessing: ${person.full_name}`));
      
      const socialUrl = await findSocialUrl(page, person.full_name, person.type);
      
      if (socialUrl) {
        await updatePersonSocialUrl(person.id, socialUrl);
      } else {
        console.log(chalk.yellow(`No social URL found for ${person.full_name}`));
      }
    }

    await stagehand.context.close();
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

run().catch(console.error);
