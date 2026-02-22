require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── FUENTES EXTERNAS ─────────────────────────────────────────────────────────
const HP_API   = 'https://hp-api.onrender.com/api';      // personajes + hechizos (con imágenes)
const POT_API  = 'https://potterapi-fedeperin.vercel.app/es'; // libros, pociones, casas (en español)

// ─── DATOS ESTÁTICOS (películas — ninguna API pública las tiene bien) ─────────
// Posters via TMDB (image.tmdb.org no tiene CORS)
const TMDB = 'https://image.tmdb.org/t/p/w500';
const MOVIES = [
  { id: '1', title: 'Harry Potter y la piedra filosofal', year: 2001,
    director: 'Chris Columbus', duration_min: 152,
    image: `${TMDB}/wuMc08IPKEatf9rnMNXvIDxqP4W.jpg` },
  { id: '2', title: 'Harry Potter y la cámara secreta', year: 2002,
    director: 'Chris Columbus', duration_min: 161,
    image: `${TMDB}/sdEOH0992YZ0QSxgXNIGLq1ToUi.jpg` },
  { id: '3', title: 'Harry Potter y el prisionero de Azkaban', year: 2004,
    director: 'Alfonso Cuarón', duration_min: 142,
    image: `${TMDB}/aWxwnYoe8p2d2fcxOqtvAtJ72Rw.jpg` },
  { id: '4', title: 'Harry Potter y el cáliz de fuego', year: 2005,
    director: 'Mike Newell', duration_min: 157,
    image: `${TMDB}/fECBqgm3g4u5bHbkKFVS0VsFOBG.jpg` },
  { id: '5', title: 'Harry Potter y la Orden del Fénix', year: 2007,
    director: 'David Yates', duration_min: 138,
    image: `${TMDB}/s7EsvjA7gT6Ips3bgP4EVbGKpXj.jpg` },
  { id: '6', title: 'Harry Potter y el misterio del príncipe', year: 2009,
    director: 'David Yates', duration_min: 153,
    image: `${TMDB}/mEQfDSPpRkGlLGKMoJv7bnhSA4F.jpg` },
  { id: '7', title: 'Harry Potter y las reliquias de la Muerte – Parte 1', year: 2010,
    director: 'David Yates', duration_min: 146,
    image: `${TMDB}/maP4MTfPCeVD2FZnKxCLJ1FsTNE.jpg` },
  { id: '8', title: 'Harry Potter y las reliquias de la Muerte – Parte 2', year: 2011,
    director: 'David Yates', duration_min: 130,
    image: `${TMDB}/g8YV3fHDJEwjLKDJFdLqcCRJ35A.jpg` },
];

// ─── CACHE ────────────────────────────────────────────────────────────────────
const cache = {
  characters: [],
  spells:     [],
  potions:    [],
  books:      [],
  houses:     [],
  movies:     MOVIES,
  loaded:     {},
  loading:    {},
  listeners:  {},
};

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const slugify = (str) => str?.toLowerCase().replace(/\s+/g, '-') || '';

// Imagen fallback para personajes sin foto
const avatarUrl = (name) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&size=400&background=740001&color=f5c518&font-size=0.35&bold=true`;

// ─── CARGA DE CADA RECURSO ────────────────────────────────────────────────────
const loaders = {

  characters: async () => {
    const { data } = await axios.get(`${HP_API}/characters`, { timeout: 20000 });
    return data.map((c, i) => ({
      id:         String(c.id || i + 1),
      name:       c.name || 'Unknown',
      house:      c.house || 'Unknown',
      species:    c.species || '—',
      gender:     c.gender || '—',
      ancestry:   c.ancestry || '—',
      eyeColour:  c.eyeColour || '—',
      hairColour: c.hairColour || '—',
      wand:       c.wand || {},
      patronus:   c.patronus || '—',
      hogwartsStudent: c.hogwartsStudent || false,
      hogwartsStaff:   c.hogwartsStaff   || false,
      actor:      c.actor || '—',
      alive:      c.alive ?? true,
      image:      c.image || avatarUrl(c.name),
    }));
  },

  spells: async () => {
    const { data } = await axios.get(`${HP_API}/spells`, { timeout: 15000 });
    return data.map((s, i) => ({
      id:          String(s.id || i + 1),
      name:        s.name || 'Unknown',
      description: s.description || '—',
      image:       avatarUrl(s.name),
    }));
  },

  potions: async () => {
    try {
      const { data } = await axios.get(`${POT_API}/potions`, { timeout: 15000 });
      if (Array.isArray(data) && data.length > 0) {
        return data.map((p, i) => ({
          id:          String(p.index ?? i + 1),
          name:        p.name || 'Unknown',
          effect:      p.effect || '—',
          difficulty:  p.difficulty || '—',
          ingredients: p.ingredients || [],
          characteristics: p.characteristics || '—',
          image:       p.image || avatarUrl(p.name),
        }));
      }
    } catch (e) {
      console.warn('⚠️  potterapi pociones caída, usando fallback:', e.message);
    }
    // Fallback hardcodeado si la API está caída
    return FALLBACK_POTIONS;
  },

  books: async () => {
    const { data } = await axios.get(`${POT_API}/books`, { timeout: 15000 });
    return data.map((b, i) => ({
      id:           String(b.index ?? i + 1),
      title:        b.title || 'Unknown',
      originalTitle: b.originalTitle || b.title || '—',
      releaseDate:  b.releaseDate || '—',
      description:  b.description || '—',
      pages:        b.pages || '—',
      coverType:    b.coverType || '—',
      image:        b.cover || avatarUrl(b.title),
    }));
  },

  houses: async () => {
    const { data } = await axios.get(`${POT_API}/houses`, { timeout: 15000 });
    return data.map((h, i) => ({
      id:          String(h.index ?? i + 1),
      name:        h.house || h.name || 'Unknown',
      emoji:       h.emoji || '',
      founder:     h.founder || '—',
      colors:      h.colors || [],
      animal:      h.animal || '—',
      element:     h.element || '—',
      ghost:       h.ghost || '—',
      commonRoom:  h.commonRoom || '—',
      heads:       h.heads || [],
      traits:      h.traits || [],
      image:       h.image || avatarUrl(h.house || h.name),
    }));
  },
};


// ─── FALLBACK POCIONES (si potterapi está caída) ─────────────────────────────
const FALLBACK_POTIONS = [
  { id:'1', name:'Poción Multijugos', effect:'Permite asumir la forma física de otra persona durante una hora.', difficulty:'Avanzado', ingredients:['Lacasalia','Sanguijuela babosa','Polvo de bícornio','Escamas de pieles cambiantes','Sello de Knotgrass'], characteristics:'Espesa, burbujeante, de sabor repugnante', image: avatarUrl('Poción Multijugos') },
  { id:'2', name:'Felix Felicis', effect:'Confiere suerte extraordinaria al bebedor durante un tiempo limitado.', difficulty:'Excepcional', ingredients:['Flor de Asfódelo','Plumas de Occamy','Gusano Doxy','Aguamenti helado'], characteristics:'Dorada y líquida como el oro fundido', image: avatarUrl('Felix Felicis') },
  { id:'3', name:'Veritaserum', effect:'Poción de la verdad; obliga al bebedor a decir la verdad.', difficulty:'Avanzado', ingredients:['Extracto de Jobberknoll','Polvo de Moonseed','Esencia de Belladona'], characteristics:'Incolora e inodora, idéntica al agua', image: avatarUrl('Veritaserum') },
  { id:'4', name:'Eléboro', effect:'Cura la manía y otras enfermedades mentales.', difficulty:'Ordinario', ingredients:['Raíz de eléboro negro','Polvo de Bezoar'], characteristics:'Verde pálido, olor acre', image: avatarUrl('Eléboro') },
  { id:'5', name:'Pocima de Amor', effect:'Induce una obsesión o encaprichamiento en el bebedor.', difficulty:'Moderado', ingredients:['Amortentia destilada','Polvo de perla','Pétalo de rosa'], characteristics:'Nácar iridiscente con vapor en espiral', image: avatarUrl('Pocima de Amor') },
  { id:'6', name:'Poción Vigilia', effect:'Mantiene al bebedor despierto y alerta durante días.', difficulty:'Ordinario', ingredients:['Raíz de valeriana','Aceite de menta','Alas de murciélago'], characteristics:'Anaranjada y espumosa', image: avatarUrl('Poción Vigilia') },
  { id:'7', name:'Poción contra la Petrificación', effect:'Revierte los efectos de la petrificación.', difficulty:'Avanzado', ingredients:['Semillas de mandrágora cocida','Plumas de fénix','Polvo de Bícornio'], characteristics:'Plateada y brillante', image: avatarUrl('Poción contra la Petrificación') },
  { id:'8', name:'Poción de la Locura', effect:'Provoca confusión mental severa y pérdida del juicio.', difficulty:'Avanzado', ingredients:['Veneno de Confundus','Esencia de Insanius'], characteristics:'Violeta turbio', image: avatarUrl('Poción de la Locura') },
  { id:'9', name:'Poción Espectral', effect:'Vuelve invisible temporalmente al bebedor.', difficulty:'Excepcional', ingredients:['Piel de Demiguise','Esencia de Invisibilidad','Agua lunar'], characteristics:'Completamente transparente', image: avatarUrl('Poción Espectral') },
  { id:'10', name:'Bezoar', effect:'Antídoto general contra la mayoría de venenos.', difficulty:'Ordinario', ingredients:['Piedra del estómago de una cabra'], characteristics:'Piedra opaca de color marrón oscuro', image: avatarUrl('Bezoar') },
];

// ─── FUNCIÓN GENÉRICA DE CARGA CON COLA ──────────────────────────────────────
async function loadResource(resource) {
  if (cache.loaded[resource]) return;

  if (cache.loading[resource]) {
    if (!cache.listeners[resource]) cache.listeners[resource] = [];
    await new Promise((r) => cache.listeners[resource].push(r));
    return;
  }

  // movies ya están cargadas estáticamente
  if (resource === 'movies') {
    cache.loaded['movies'] = true;
    return;
  }

  cache.loading[resource] = true;
  console.log(`⬇️  Cargando ${resource}...`);

  try {
    cache[resource]      = await loaders[resource]();
    cache.loaded[resource] = true;
    console.log(`✅ ${resource}: ${cache[resource].length} items`);
  } catch (err) {
    console.error(`❌ Error cargando ${resource}:`, err.message);
    setTimeout(() => loadResource(resource), 8000); // reintento en 8s
  } finally {
    cache.loading[resource] = false;
    if (cache.listeners[resource]) {
      cache.listeners[resource].forEach((r) => r());
      cache.listeners[resource] = [];
    }
  }
}

// ─── PRECARGA COMPLETA ────────────────────────────────────────────────────────
async function preloadAll() {
  console.log('🧙 Cargando el mundo mágico de Harry Potter...');
  cache.loaded['movies'] = true; // estáticas, ya disponibles

  await Promise.all(Object.keys(loaders).map(loadResource));

  console.log('✨ Hogwarts está listo:', {
    characters: cache.characters.length,
    spells:     cache.spells.length,
    potions:    cache.potions.length,
    books:      cache.books.length,
    houses:     cache.houses.length,
    movies:     cache.movies.length,
  });
}

// ─── HELPER QUERY (filtrar + paginar desde cache) ────────────────────────────
function queryCache(resource, { search = '', page = 1, limit = 20, house } = {}) {
  let items = [...cache[resource]];

  if (search) {
    const term = search.toLowerCase();
    items = items.filter(
      (i) =>
        (i.name  && i.name.toLowerCase().includes(term)) ||
        (i.title && i.title.toLowerCase().includes(term))
    );
  }

  // Filtro especial por casa (solo characters)
  if (house) {
    items = items.filter(
      (i) => i.house && i.house.toLowerCase() === house.toLowerCase()
    );
  }

  const total   = items.length;
  const start   = (page - 1) * limit;
  const results = items.slice(start, start + limit);

  return {
    count:      total,
    page:       Number(page),
    limit:      Number(limit),
    totalPages: Math.ceil(total / limit),
    hasMore:    start + limit < total,
    results,
  };
}

// ─── RUTAS GENÉRICAS ──────────────────────────────────────────────────────────
const RESOURCES = ['characters', 'spells', 'potions', 'books', 'houses', 'movies'];

RESOURCES.forEach((resource) => {

  // Lista paginada
  app.get(`/api/${resource}`, async (req, res) => {
    if (!cache.loaded[resource]) {
      loadResource(resource);
      let waited = 0;
      while (!cache.loaded[resource] && waited < 12000) {
        await new Promise((r) => setTimeout(r, 150));
        waited += 150;
      }
    }
    const { page = 1, limit = 20, search, house } = req.query;
    res.json(queryCache(resource, { search, page: Number(page), limit: Number(limit), house }));
  });

  // Por ID
  app.get(`/api/${resource}/:id`, async (req, res) => {
    if (!cache.loaded[resource]) await loadResource(resource);
    const item = cache[resource].find((i) => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Not found' });
    res.json(item);
  });
});

// ─── /api/universe — todo de una vez ─────────────────────────────────────────
app.get('/api/universe', async (req, res) => {
  const notLoaded = RESOURCES.filter((r) => !cache.loaded[r]);
  if (notLoaded.length > 0) await Promise.all(notLoaded.map(loadResource));

  res.json(
    RESOURCES.reduce((acc, r) => {
      acc[r] = { count: cache[r].length, results: cache[r] };
      return acc;
    }, {})
  );
});

// ─── /api/characters/house/:house ────────────────────────────────────────────
app.get('/api/characters/house/:house', async (req, res) => {
  if (!cache.loaded['characters']) await loadResource('characters');
  const { page = 1, limit = 20 } = req.query;
  res.json(queryCache('characters', { house: req.params.house, page: Number(page), limit: Number(limit) }));
});

// ─── CACHE STATUS ─────────────────────────────────────────────────────────────
app.get('/api/cache/status', (req, res) => {
  res.json(
    RESOURCES.reduce((acc, r) => {
      acc[r] = { loaded: !!cache.loaded[r], count: cache[r].length };
      return acc;
    }, {})
  );
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Harry Potter API running 🧙' });
});

app.get('/', (req, res) => {
  res.send('🧙 Harry Potter API — visita /api/universe');
});

// ─── ARRANQUE ─────────────────────────────────────────────────────────────────
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏰 Harry Potter API → http://localhost:${PORT}`);
  console.log(`\n📡 Endpoints:`);
  console.log(`   GET /api/universe              → todo el mundo mágico`);
  console.log(`   GET /api/characters            → todos los personajes (con imagen)`);
  console.log(`   GET /api/characters/house/:h   → filtrar por casa`);
  console.log(`   GET /api/spells                → todos los hechizos`);
  console.log(`   GET /api/potions               → todas las pociones`);
  console.log(`   GET /api/books                 → todos los libros`);
  console.log(`   GET /api/houses                → las 4 casas`);
  console.log(`   GET /api/movies                → las 8 películas`);
  console.log(`   GET /api/cache/status          → estado del cache\n`);
  console.log(`   ?search=harry  ?page=2  ?limit=10  ?house=Gryffindor\n`);

  preloadAll();
});
