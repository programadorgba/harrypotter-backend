require('dotenv').config();
const express = require('express');
const cors = require('cors');

const {
  ApiError,
  ok,
  notFoundHandler,
  errorHandler
} = require('./middlewares/errorHandler');

const app = express();

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Endpoint de salud para comprobar que el backend funciona
app.get('/api/health', (req, res) => {
  return ok(res, { status: 'ok', message: 'Harry Potter API backend running' });
});

// Simulación de "base de datos" en memoria.
// Más adelante puedes reemplazar estos arrays por consultas reales a una base de datos.

// Personajes
const characters = [
  // Gryffindor
  { id: 1, name: 'Harry Potter', house: 'Gryffindor' },
  { id: 2, name: 'Hermione Granger', house: 'Gryffindor' },
  // Slytherin
  { id: 3, name: 'Draco Malfoy', house: 'Slytherin' },
  { id: 4, name: 'Severus Snape', house: 'Slytherin' },
  // Ravenclaw
  { id: 5, name: 'Luna Lovegood', house: 'Ravenclaw' },
  { id: 6, name: 'Cho Chang', house: 'Ravenclaw' },
  // Hufflepuff
  { id: 7, name: 'Cedric Diggory', house: 'Hufflepuff' },
  { id: 8, name: 'Nymphadora Tonks', house: 'Hufflepuff' }
];

// Libros y capítulos (en castellano)
const books = [
  {
    id: 1,
    title: 'Harry Potter y la piedra filosofal',
    year: 1997,
    chapters: [
      { id: 1, title: 'El niño que vivió' },
      { id: 2, title: 'El vidrio que se desvaneció' }
    ]
  },
  {
    id: 2,
    title: 'Harry Potter y la cámara secreta',
    year: 1998,
    chapters: [
      { id: 1, title: 'El peor cumpleaños' },
      { id: 2, title: 'La advertencia de Dobby' }
    ]
  }
];

// Películas (en castellano)
const movies = [
  { id: 1, title: 'Harry Potter y la piedra filosofal', year: 2001 },
  { id: 2, title: 'Harry Potter y la cámara secreta', year: 2002 }
];

// Pociones (en castellano)
const potions = [
  {
    id: 1,
    name: 'Poción multijugos',
    effect: 'Permite al bebedor asumir la forma de otra persona'
  },
  {
    id: 2,
    name: 'Felix Felicis',
    effect: 'Confiere buena suerte al bebedor durante un periodo de tiempo'
  }
];

// Hechizos (descripciones en castellano)
const spells = [
  {
    id: 1,
    name: 'Expelliarmus',
    type: 'Encantamiento',
    description:
      'Encantamiento desarmador que hace que la varita del oponente salga volando de su mano'
  },
  {
    id: 2,
    name: 'Lumos',
    type: 'Encantamiento',
    description: 'Hace que la punta de la varita emita luz'
  },
  {
    id: 3,
    name: 'Expecto Patronum',
    type: 'Encantamiento',
    description: 'Conjura un Patronus que protege contra Dementores'
  }
];

// Endpoints de "base de datos"

// Personajes
app.get('/api/characters', (req, res) => {
  return ok(res, characters);
});

// Libros
app.get('/api/books', (req, res) => {
  return ok(res, books);
});

// Capítulos (todos)
app.get('/api/chapters', (req, res) => {
  const allChapters = books.flatMap((book) =>
    book.chapters.map((chapter) => ({
      ...chapter,
      bookId: book.id,
      bookTitle: book.title
    }))
  );

  return ok(res, allChapters);
});

// Capítulos por libro
app.get('/api/books/:id/chapters', (req, res) => {
  const bookId = Number(req.params.id);
  if (!Number.isFinite(bookId)) {
    throw new ApiError(400, 'Parámetro inválido: id debe ser numérico');
  }

  const book = books.find((b) => b.id === bookId);

  if (!book) {
    throw new ApiError(404, 'Libro no encontrado', { bookId });
  }

  return ok(res, book.chapters);
});

// Películas
app.get('/api/movies', (req, res) => {
  return ok(res, movies);
});

// Pociones
app.get('/api/potions', (req, res) => {
  return ok(res, potions);
});

// Hechizos
app.get('/api/spells', (req, res) => {
  return ok(res, spells);
});

app.get('/', (req, res) => {
  res.send('Bienvenido a la API de Harry Potter');
});

// 404 para rutas /api no encontradas
app.use('/api', notFoundHandler);

// Middleware global de errores (siempre al final)
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Harry Potter API backend escuchando en el puerto ${PORT}`);
});

