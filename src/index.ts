import { server } from './utils/socket';

const port = process.env.PORT ?? '4000';
server.listen(port, () => {
  console.log(`Listening: http://localhost:${port}`);
});
