const mongoose = require('mongoose');

const MONGO_URL = process.env.MONGO_URL;
mongoose.connect(MONGO_URL || 'mongodb://localhost/data', {
   useMongoClient: true
});

const db = mongoose.connection;

db.on('error', (err) => console.log('Error connecting to database: ', err));
