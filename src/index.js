const app = require('./app');

const port = '8888';

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is listening on port ${port}...`);
});