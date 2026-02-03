
import express from 'express';
import cors from 'cors';
import router from './routes';

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

app.use('/api', router); // Mount api routes

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
