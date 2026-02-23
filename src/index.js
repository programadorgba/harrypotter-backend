require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');

const app  = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ─── FUENTES EXTERNAS ─────────────────────────────────────────────────────────
const HP_API     = 'https://hp-api.onrender.com/api';           // personajes + hechizos
const POT_API    = 'https://potterapi-fedeperin.vercel.app/es';  // libros, pociones, casas (es)
const POTTERDB   = 'https://api.potterdb.com/v1';               // 5246 personajes CON imágenes

// ─── DATOS PELÍCULAS (duración real — PotterDB no la tiene) ─────────────────
const MOVIE_DURATION = { 1:152, 2:161, 3:142, 4:157, 5:138, 6:153, 7:146, 8:130 };

// ─── CACHE ────────────────────────────────────────────────────────────────────
const cache = {
  characters: [],
  spells:     [],
  potions:    [],
  books:      [],
  houses:     [],
  movies:     [],
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
    // ── 1. Cargar TODOS los personajes de PotterDB (paginado, ~5246 personajes con imágenes) ──
    let potterdbMap = {};
    try {
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 60) { // max 60 páginas × 100 = 6000
        const { data: pd } = await axios.get(`${POTTERDB}/characters`, {
          params: { 'page[size]': 100, 'page[number]': page },
          timeout: 20000,
        });
        const items = pd.data || [];
        items.forEach(item => {
          const name  = item.attributes?.name;
          const img   = item.attributes?.image;
          if (name) potterdbMap[name.toLowerCase()] = {
            image:   img || null,
            house:   item.attributes?.house   || null,
            species: item.attributes?.species || null,
            gender:  item.attributes?.gender  || null,
            dob:     item.attributes?.born    || null,
            actor:   item.attributes?.portrayed_by || null,
          };
        });
        // Siguiente página
        hasMore = !!(pd.meta?.pagination?.next);
        page++;
      }
      console.log(`  📚 PotterDB: ${Object.keys(potterdbMap).length} personajes con datos`);
    } catch (e) {
      console.warn('⚠️  PotterDB characters falló:', e.message);
    }

    // ── 2. hp-api como base (mejor estructura de datos: varita, patronus, casa) ──
    let hpChars = [];
    try {
      const { data } = await axios.get(`${HP_API}/characters`, { timeout: 20000 });
      hpChars = data || [];
    } catch (e) {
      console.warn('⚠️  hp-api characters falló:', e.message);
    }

    // ── 3. Merge: hp-api como base + imagen de PotterDB ──
    const mapped = hpChars.map((c, i) => {
      const key = (c.name || '').toLowerCase();
      const pd  = potterdbMap[key] || {};
      return {
        id:         String(c.id || i + 1),
        name:       c.name || 'Unknown',
        house:      c.house || pd.house || '',
        species:    c.species || pd.species || '',
        gender:     c.gender || pd.gender || '',
        ancestry:   c.ancestry || '',
        eyeColour:  c.eyeColour || '',
        hairColour: c.hairColour || '',
        wand:       c.wand || {},
        patronus:   c.patronus || '',
        hogwartsStudent: c.hogwartsStudent || false,
        hogwartsStaff:   c.hogwartsStaff   || false,
        actor:      c.actor || pd.actor || '',
        alternate_actors: c.alternate_actors || [],
        alternate_names:  c.alternate_names  || [],
        alive:      c.alive ?? true,
        image:      c.image || pd.image || avatarUrl(c.name),
      };
    });

    // ── 4. Añadir personajes de PotterDB que no están en hp-api ──
    //    (solo los que tienen imagen, para no inflar con entradas vacías)
    const hpNames = new Set(mapped.map(c => c.name.toLowerCase()));
    let extra = 0;
    Object.entries(potterdbMap).forEach(([key, pd]) => {
      if (!hpNames.has(key) && pd.image) {
        mapped.push({
          id:         `pd-${key.replace(/\s+/g,'-')}`,
          name:       key.split(' ').map(w => w[0]?.toUpperCase() + w.slice(1)).join(' '),
          house:      pd.house || '',
          species:    pd.species || '',
          gender:     pd.gender || '',
          ancestry:   '',
          eyeColour:  '',
          hairColour: '',
          wand:       {},
          patronus:   '',
          hogwartsStudent: false,
          hogwartsStaff:   false,
          actor:      pd.actor || '',
          alternate_actors: [],
          alternate_names:  [],
          alive:      true,
          image:      pd.image,
        });
        extra++;
      }
    });
    console.log(`  👥 Characters total: ${mapped.length} (hp-api: ${hpChars.length} + extras con img: ${extra})`);
    return mapped;
  },

  spells: async () => {
    // PotterDB tiene 333 hechizos vs 77 de hp-api
    try {
      let all = [];
      let page = 1;
      let hasMore = true;
      while (hasMore && page <= 5) {
        const { data: pd } = await axios.get(`${POTTERDB}/spells`, {
          params: { 'page[size]': 100, 'page[number]': page },
          timeout: 15000,
        });
        (pd.data || []).forEach((s, i) => {
          all.push({
            id:          s.id || `spell-${page}-${i}`,
            name:        s.attributes?.incantation || s.attributes?.name || 'Unknown',
            description: s.attributes?.effect || '—',
            category:    s.attributes?.category || '',
            image:       s.attributes?.image || avatarUrl(s.attributes?.incantation || s.attributes?.name),
          });
        });
        hasMore = !!(pd.meta?.pagination?.next);
        page++;
      }
      if (all.length > 0) {
        console.log(`  ✨ PotterDB spells: ${all.length}`);
        return all;
      }
    } catch (e) {
      console.warn('PotterDB spells failed, fallback hp-api:', e.message);
    }
    // Fallback
    const { data } = await axios.get(`${HP_API}/spells`, { timeout: 15000 });
    return data.map((s, i) => ({
      id:          String(s.id || i + 1),
      name:        s.name || 'Unknown',
      description: s.description || '—',
      category:    '',
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

  movies: async () => {
    // PotterDB /v1/movies — tiene posters reales de todas las películas HP
    const { data: pd } = await axios.get(`${POTTERDB}/movies`, {
      params: { 'page[size]': 20 },
      timeout: 15000,
    });
    const items = (pd.data || [])
      .filter(m => (m.attributes?.title || '').toLowerCase().includes('harry potter'));
    
    return items.map((m, i) => ({
      id:           m.id || String(i + 1),
      title:        m.attributes?.title || 'Unknown',
      year:         m.attributes?.release_date
                      ? new Date(m.attributes.release_date).getFullYear()
                      : null,
      director:     m.attributes?.directors?.join(', ') || '—',
      duration_min: MOVIE_DURATION[i + 1] || null,
      image:        m.attributes?.poster || m.attributes?.cover || m.attributes?.image || null,
      summary:      m.attributes?.summary || '',
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