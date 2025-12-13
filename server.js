// server.js
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = require('./app');

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
