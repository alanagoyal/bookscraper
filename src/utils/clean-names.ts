// Helper function to clean names
export function cleanName(fullString: string): string {
  // Remove any part after a comma
  const beforeComma = fullString.split(',')[0];
  
  // Remove any prefixes like "Processing:" or similar
  const withoutPrefix = beforeComma.replace(/^.*?:\s*/, '');
  
  // Trim any whitespace
  const cleanedName = withoutPrefix.trim();
  
  return cleanedName;
}