import { createApiServer, startServer } from '@myorg/api-server';
import serversRouter from './routes/servers';
import channelsRouter from './routes/channels';
import messagesRouter from './routes/messages';
import threadsRouter from './routes/threads';
import scrapeRouter from './routes/scrape';

const app = createApiServer({
  dbPath: './discord-scraper.db',
  enableLogging: process.env.NODE_ENV === 'development'
});

// Add domain routes
app.use('/api/servers', serversRouter);
app.use('/api/channels', channelsRouter);
app.use('/api/messages', messagesRouter);
app.use('/api/threads', threadsRouter);
app.use('/api/scrape', scrapeRouter);

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

if (require.main === module) {
  startServer(app, PORT);
}

export default app;
