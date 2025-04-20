
import { Mastra } from '@mastra/core/mastra';
import { createLogger } from '@mastra/core/logger';
import { booklistAgent } from './agents';

export const mastra = new Mastra({
  agents: { booklistAgent },
  logger: createLogger({
    name: 'Booklist',
    level: 'info',
  }),
});
