import app from './server/index';
import express from 'express';
import path from 'path';

app.use('/', express.static(path.join(__dirname, 'build')));
