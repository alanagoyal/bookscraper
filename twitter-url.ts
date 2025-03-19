import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// To run: npx tsx twitter-url.ts

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment variables');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function standardizeTwitterUrl(url: string): string {
  if (!url) return '';
  
  // Only process Twitter/X URLs
  if (!url.toLowerCase().includes('twitter.com') && !url.toLowerCase().includes('x.com')) {
    return url;
  }
  
  try {
    // If it's a full URL, parse it and extract just the username
    if (url.startsWith('http')) {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(part => part);
      // If we have a username in the path, use it
      if (pathParts.length > 0) {
        return `https://x.com/${pathParts[0]}`;
      }
    }
    
    // If it's just a username (with or without @)
    if (url.match(/^@?[a-zA-Z0-9_]+$/)) {
      return `https://x.com/${url.replace('@', '')}`;
    }
    
    // Try to extract username from twitter.com/username format
    const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)/i);
    if (match && match[1]) {
      return `https://x.com/${match[1]}`;
    }
    
    // If we can't parse it in any known format, return unchanged
    return url;
    
  } catch (error) {
    // If URL parsing fails, return unchanged
    return url;
  }
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => {
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
  });
}

async function run() {
  try {
    // Get all people
    const { data: people, error: queryError } = await supabase
      .from('people')
      .select('id, url')
      .order('id', { ascending: true });

    if (queryError) {
      console.error('Error querying people:', queryError);
      return;
    }

    console.log(`Found ${people?.length || 0} people to process`);

    // Process each person
    for (const person of people || []) {
      try {
        const standardizedUrl = standardizeTwitterUrl(person.url);
        
        if (standardizedUrl !== person.url) {
          console.log(`Converting: "${person.url}" -> "${standardizedUrl}"`);

          // Update the URL
          const { error: updateError } = await supabase
            .from('people')
            .update({ url: standardizedUrl })
            .eq('id', person.id);
          
          if (updateError) {
            console.error(`Failed to update person ${person.id}:`, updateError);
          }
        }
      } catch (error) {
        console.error(`Error processing person ${person.id}:`, error);
      }
    }

    console.log('URL standardization complete');
  } catch (error) {
    console.error('Error:', error);
  }
}

run().catch(console.error);