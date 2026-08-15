const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

function parseExtra(extraStr) {
  const extra = {};
  if (!extraStr) return extra;
  const parts = extraStr.split('&');
  parts.forEach(p => {
    const [k, v] = p.split('=');
    if (k && v) extra[k] = decodeURIComponent(v);
  });
  return extra;
}

const MANIFEST = {
  id: 'org.sieutamphim.nuvio',
  version: '10.0.0',
  name: 'Sưu Tầm Phim',
  description: 'Kho siêu khổng lồ 1000+ bộ mỗi danh mục: Phim Lẻ, Phim Bộ, Anime Nhật, Movie Anime & Hoạt hình Trung Quốc',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'stp_latest_movies',
      name: 'Sưu Tầm Phim - Phim Lẻ (1000+ Bộ)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_latest_series',
      name: 'Sưu Tầm Phim - Phim Bộ (1000+ Bộ)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_anime',
      name: 'Sưu Tầm Phim - Anime Nhật Bản (1000+ Bộ)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_anime_movie',
      name: 'Sưu Tầm Phim - Movie Anime Chiếu Rạp (1000+ Bộ)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hoathinh',
      name: 'Sưu Tầm Phim - Hoạt Hình 3D Trung Quốc (1000+ Bộ)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v10.0.0 (Instant Mega Scale)!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const cacheStore = {
  movies: null,
  series: null,
  anime: null,
  animeMovie: null,
  hoathinh: null,
  lastUpdated: 0
};

async function fetchAllMegaData() {
  const now = Date.now();
  if (cacheStore.movies && (now - cacheStore.lastUpdated < 30 * 60 * 1000)) {
    return cacheStore;
  }

  let allMovies = [];
  let allSeries = [];
  let rawSingleMovies = [];

  const moviePromises = [];
  for (let p = 1; p <= 40; p++) {
    moviePromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/phim-le?page=${p}&limit=50`, { timeout: 6000 }).catch(() => null));
  }

  const seriesPromises = [];
  for (let p = 1; p <= 25; p++) {
    seriesPromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/phim-bo?page=${p}&limit=50`, { timeout: 6000 }).catch(() => null));
  }

  const hhPromises = [];
  for (let p = 1; p <= 65; p++) {
    hhPromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${p}&limit=50`, { timeout: 6000 }).catch(() => null));
  }

  const [movieRes, seriesRes, hhRes] = await Promise.all([
    Promise.all(moviePromises),
    Promise.all(seriesPromises),
    Promise.all(hhPromises)
  ]);

  const cdn = 'https://phimimg.com';

  movieRes.forEach(res => {
    if (res?.data?.data?.items) {
      res.data.data.items.forEach(item => {
        const itemObj = {
          id: `phimapi:${item.slug}`,
          type: 'movie',
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
          background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
          description: 'Phim Lẻ HD',
          country: JSON.stringify(item.country || '').toLowerCase(),
          category: JSON.stringify(item.category || '').toLowerCase(),
          slug: (item.slug || '').toLowerCase(),
          originName: (item.origin_name || '').toLowerCase()
        };
        allMovies.push(itemObj);
        rawSingleMovies.push(itemObj);
      });
    }
  });

  seriesRes.forEach(res => {
    if (res?.data?.data?.items) {
      res.data.data.items.forEach(item => {
        allSeries.push({
          id: `phimapi:${item.slug}`,
          type: 'series',
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
          background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
          description: 'Phim Bộ HD'
        });
      });
    }
  });

  let rawHh = [];
  hhRes.forEach(res => {
    if (res?.data?.data?.items) {
      rawHh = rawHh.concat(res.data.data.items);
    }
  });

  const animeList = [];
  const animeMovieList = [];
  const cnHoathinhList = [];

  const strictBlacklist = [
    'mặt cười', 'laughing man', 'stand alone complex', 's.a.c', 
    'lord el-melloi', 'rail zeppelin', 'case files', 'grand blue', 
    '100 cô bạn gái', 'yozakura', 'hell mode', 'cậu và tớ', 'nữ hùng',
    'oakhaven', 'phần 2', 'phần 3', 'season 2', 'season 3', 'ss2', 'ss3'
  ];

  rawSingleMovies.forEach(item => {
    const nameLower = item.name.toLowerCase();
    const isJapan = item.country.includes('nhật bản') || item.country.includes('japan') || item.country.includes('jp') ||
                    item.category.includes('hoạt hình') || item.slug.includes('anime') || nameLower.includes('anime');
    
    if (isJapan) {
      const hasBlacklistedWord = strictBlacklist.some(kw => nameLower.includes(kw) || item.slug.includes(kw));
      if (!hasBlacklistedWord) {
        animeMovieList.push({
          id: item.id,
          type: 'movie',
          name: item.name,
          poster: item.poster,
          background: item.background,
          description: 'Movie Anime Chiếu Rạp HD'
        });
      }
    }
  });

  rawHh.forEach(item => {
    const cStr = JSON.stringify(item.country || '').toLowerCase();
    const nameStr = (item.name || '').toLowerCase();
    const originName = (item.origin_name || '').toLowerCase();
    const slugStr = (item.slug || '').toLowerCase();
    const categoryStr = JSON.stringify(item.category || '').toLowerCase();
    const contentStr = (item.content || '').toLowerCase();
    const eStr = (item.episode_current || '').toLowerCase();

    const isJapan = cStr.includes('nhật bản') || cStr.includes('japan') || cStr.includes('jp');

    if (isJapan) {
      animeList.push({
        id: `phimapi:${item.slug}`,
        type: 'series',
        name: item.name,
        poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
        background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
        description: 'Anime Nhật Bản HD'
      });

      const hasBlacklistedWord = strictBlacklist.some(kw => nameStr.includes(kw) || slugStr.includes(kw));
      if (hasBlacklistedWord) return;

      if (nameStr.includes('lời nguyền') || nameStr.includes('ju-on') || nameStr.includes('narayama') || 
          categoryStr.includes('live action') || contentStr.includes('live-action') ||
          nameStr.includes('phần') || nameStr.includes('season') || nameStr.includes('mùa') ||
          eStr.includes('tập') || eStr.includes('/')) {
        return;
      }

      const isMovie = item.type === 'movie' || item.type === 'single' ||
                      nameStr.includes('movie') || originName.includes('movie') || slugStr.includes('movie') ||
                      nameStr.includes('ova') || originName.includes('ova') || slugStr.includes('ova') ||
                      nameStr.includes('special') || nameStr.includes('chieu rap') || slugStr.includes('chieu-rap') ||
                      eStr.includes('full') || eStr.includes('1 tập') || eStr.includes('hoàn tất') || eStr.includes('1/1');

      if (isMovie) {
        animeMovieList.push({
          id: `phimapi:${item.slug}`,
          type: 'movie',
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
          background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
          description: 'Movie Anime Chiếu Rạp HD'
        });
      }
    } else {
      cnHoathinhList.push({
        id: `phimapi:${item.slug}`,
        type: 'series',
        name: item.name,
        poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
        background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
        description: 'Hoạt hình Trung Quốc HD'
      });
    }
  });

  cacheStore.movies = allMovies;
  cacheStore.series = allSeries;
  cacheStore.anime = animeList;
  cacheStore.animeMovie = animeMovieList;
  cacheStore.hoathinh = cnHoathinhList;
  cacheStore.lastUpdated = now;

  return cacheStore;
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const searchQuery = (extra.search || '').toLowerCase();
  const skip = parseInt(extra.skip) || 0;
  const limit = 50;

  const data = await fetchAllMegaData();
  let fullList = [];

  if (id === 'stp_latest_movies') fullList = data.movies;
  else if (id === 'stp_latest_series') fullList = data.series;
  else if (id === 'stp_anime') fullList = data.anime;
  else if (id === 'stp_anime_movie') fullList = data.animeMovie;
  else if (id === 'stp_hoathinh') fullList = data.hoathinh;

  if (searchQuery) {
    fullList = fullList.filter(item => item.name.toLowerCase().includes(searchQuery));
  }

  const metas = fullList.slice(skip, skip + limit);
  res.json({ metas });
});

app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;

  if (id.startsWith('phimapi:')) {
    const slug = id.replace('phimapi:', '').split(':')[0];
    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 8000 });
      const movie = data?.movie || {};
      const epData = data?.episodes?.[0]?.server_data || [];

      const p = movie.poster_url?.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
      const b = movie.thumb_url?.startsWith('http') ? movie.thumb_url : `https://phimimg.com/${movie.thumb_url}`;
      const thumbImg = b || p;

      const videos = epData.map((ep, idx) => ({
        id: `phimapi:${slug}:${ep.slug}`,
        title: ep.name.includes('Tập') ? ep.name : `Tập ${ep.name}`,
        thumbnail: thumbImg,
        season: 1,
        episode: idx + 1
      }));

      return res.json({
        meta: {
          id: `phimapi:${slug}`,
          type: type,
          name: movie.name || 'Phim',
          poster: p,
          background: thumbImg,
          description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : '',
          videos: videos.length > 0 ? videos : [{ id: `phimapi:${slug}:full`, title: 'Tập 1', thumbnail: thumbImg, season: 1, episode: 1 }]
        }
      });
    } catch (e) {
      return res.json({ meta: null });
    }
  }

  res.json({ meta: null });
});

app.get(['/stream/:type/:id.json', '/stream/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;

  if (id.startsWith('phimapi:')) {
    const parts = id.split(':');
    const slug = parts[1];
    const epSlug = parts[2];
    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 8000 });
      const episodes = data?.episodes?.[0]?.server_data || [];
      const ep = episodes.find(e => e.slug === epSlug) || episodes[0];
      return res.json({
        streams: ep ? [{ name: 'Server Full HD', title: ep.name, url: ep.link_m3u8 }] : []
      });
    } catch (e) {
      return res.json({ streams: [] });
    }
  }

  res.json({ streams: [] });
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
        
