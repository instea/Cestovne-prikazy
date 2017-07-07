const mongoose = require('mongoose');

const NODE_URL = process.env.NODE_URL;
mongoose.connect(NODE_URL || 'mongodb://localhost/data', {
   useMongoClient: true
});

const db = mongoose.connection;

db.on('error', (err) => console.log('Error connecting to database: ', err));
