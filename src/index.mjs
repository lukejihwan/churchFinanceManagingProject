import express from "express";
import { config } from 'dotenv';

const app = express();

const PORT = process.env.PORT || 3000;

app.get('/', (request, response) => {
    response.send("Hello World");
});

app.listen(PORT, () => {
    console.log(`Running on Port ${PORT}`);
});