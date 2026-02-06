require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint de salud para comprobar que el backend funciona
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Harry Potter API backend running' });
});

// Ejemplo simple de endpoint de personajes de Harry Potter
// Más adelante puedes reemplazar esto con datos desde una base de datos o una API externa
const characters = [
  { id: 1, name: 'Harry Potter', house: 'Gryffindor' },
  { id: 2, name: 'Hermione Granger', house: 'Gryffindor' },
  { id: 3, name: 'Ron Weasley', house: 'Gryffindor' }
];

app.get('/api/characters', (req, res) => {
  res.json(characters);
});

app.get('/', (req, res) => {
  res.send('Bienvenido a la API de Harry Potter');
});

app.listen(PORT, () => {
  console.log(`Harry Potter API backend escuchando en el puerto ${PORT}`);
});

