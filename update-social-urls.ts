import { Stagehand } from "@browserbasehq/stagehand";
import StagehandConfig from "./stagehand.config.js";
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import dotenv from 'dotenv';
import chalk from 'chalk';
import readline from 'readline';
import { standardizeTwitterUrl } from './twitter-url.ts';

dotenv.config();

// To run: npx tsx update-social-urls.ts

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getPeople() {
  const { data: people, error } = await supabase
    .from('people')
    .select('id, full_name, url')
    .is('url', null);

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

  // Standardize Twitter URLs before updating
  const finalUrl = socialUrl.toLowerCase().includes('twitter.com') || socialUrl.toLowerCase().includes('x.com')
    ? standardizeTwitterUrl(socialUrl)
    : socialUrl;

  // Now update the record
  const { error: updateError } = await supabase
    .from('people')
    .update({ url: finalUrl })
    .eq('id', id);

  if (updateError) {
    console.error(chalk.red('Error updating database:'), updateError);
    throw updateError;
  }

  console.log(chalk.green('Successfully updated database'));
}

async function findSocialUrl(page: Stagehand['page'], personName: string): Promise<string | null> {  
  // First try Twitter
  await page.goto('https://www.google.com');
  const twitterQuery = `${personName} twitter profile`;
  
  await page.act(`Type '${twitterQuery}' into the search input`);
  await page.act('Press Enter');

  // Set timeout for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { links: twitterLinks } = await page.extract({
    instruction: "Extract the first link that contains 'twitter' or 'x'. Make sure it is a valid URL.",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  if (twitterLinks[0]) {
    console.log(chalk.cyan(`\nFound Twitter profile: ${twitterLinks[0]}`));
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise<boolean>((resolve) => {
      rl.question(chalk.yellow(`Is this the correct Twitter profile? (y/n): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (confirm) return twitterLinks[0];
  }

  // Try Wikipedia if Twitter wasn't found or was rejected
  await page.goto('https://www.google.com');
  const wikiQuery = `${personName} wikipedia`;
  
  await page.act(`Type '${wikiQuery}' into the search input`);
  await page.act('Press Enter');
  
  // Set timeout for 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  const { links: wikiLinks } = await page.extract({
    instruction: "Extract the first link that contains 'wikipedia'. Make sure it is a valid URL.",
    schema: z.object({
      links: z.array(z.string())
    }),
    useTextExtract: false
  });

  if (wikiLinks[0]) {
    console.log(chalk.cyan(`\nFound Wikipedia page: ${wikiLinks[0]}`));
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    const confirm = await new Promise<boolean>((resolve) => {
      rl.question(chalk.yellow(`Is this the correct Wikipedia page? (y/n): `), (answer) => {
        rl.close();
        resolve(answer.toLowerCase() === 'y');
      });
    });
    
    if (confirm) return wikiLinks[0];
  }

  return null;
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
      
      const socialUrl = await findSocialUrl(page, person.full_name);
      
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
