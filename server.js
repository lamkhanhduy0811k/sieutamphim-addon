const express = require('express');
const axios = require('axios');
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
  version: '21.1.7',
  name: 'Sưu Tầm Phim',
  description: 'Kho khổng lồ 500+ bộ mỗi danh mục: Phim Mới Cập Nhật, Phim Lẻ, Phim Bộ, Anime Nhật, Movie Anime & Hoạt hình Trung Quốc',
  logo: 'https://i.ibb.co/689Q287/1000004533.jpg',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'stp_new_updates',
      name: 'Sưu Tầm Phim - Phim Mới & Tìm Kiếm',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_latest_movies',
      name: 'Sưu Tầm Phim - Phim Lẻ (500+ Bộ)',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_latest_series',
      name: 'Sưu Tầm Phim - Phim Bộ (500+ Bộ)',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_anime',
      name: 'Sưu Tầm Phim - Anime Nhật Bản (500+ Bộ)',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_anime_movie',
      name: 'Sưu Tầm Phim - Movie Anime Chiếu Rạp (500+ Bộ)',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hoathinh',
      name: 'Sưu Tầm Phim - Hoạt Hình 3D Trung Quốc (500+ Bộ)',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v21.1.7!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const cacheStore = {
  newUpdates: [],
  movies: [],
  series: [],
  anime: [],
  animeMovie: [],
  hoathinh: [],
  isLoaded: false
};

const strictBlacklist = [
  'mặt cười', 'laughing man', 'stand alone complex', 's.a.c', 
  'lord el-melloi', 'rail zeppelin', 'case files', 'grand blue', 
  '100 cô bạn gái', 'yozakura', 'hell mode', 'cậu và tớ', 'nữ hùng',
  'oakhaven', 'phần 2', 'phần 3', 'season 2', 'season 3', 'ss2', 'ss3'
];

async function loadAllData() {
  if (cacheStore.isLoaded) return;
  try {
    const cdn = 'https://phimimg.com';

    const moviePromises = [];
    for (let p = 1; p <= 15; p++) {
      moviePromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/phim-le?page=${p}&limit=50`, { timeout: 5000 }).catch(() => null));
    }

    const seriesPromises = [];
    for (let p = 1; p <= 15; p++) {
      seriesPromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/phim-bo?page=${p}&limit=50`, { timeout: 5000 }).catch(() => null));
    }

    const hhPromises = [];
    for (let p = 1; p <= 25; p++) {
      hhPromises.push(axios.get(`https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${p}&limit=50`, { timeout: 5000 }).catch(() => null));
    }

    const [newRes, movieRes, seriesRes, hhRes] = await Promise.all([
      axios.get('https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=1', { timeout: 5000 }).catch(() => null),
      Promise.all(moviePromises),
      Promise.all(seriesPromises),
      Promise.all(hhPromises)
    ]);

    const newUpdatesList = [];
    if (newRes?.data?.items) {
      newRes.data.items.forEach(item => {
        newUpdatesList.push({
          id: `phimapi:${item.slug}`,
          type: item.type === 'single' ? 'movie' : 'series',
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
          background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
          description: `Cập nhật: ${item.episode_current || 'HD'}`
        });
      });
    }

    const allMovies = [];
    const allSeries = [];
    const animeList = [];
    const animeMovieList = [];
    const cnHoathinhList = [];

    movieRes.forEach(res => {
      if (res?.data?.data?.items) {
        res.data.data.items.forEach(item => {
          allMovies.push({
            id: `phimapi:${item.slug}`,
            type: 'movie',
            name: item.name,
            poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
            background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
            description: 'Phim Lẻ HD'
          });
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

    hhRes.forEach(res => {
      if (res?.data?.data?.items) {
        res.data.data.items.forEach(item => {
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
      }
    });

    cacheStore.newUpdates = newUpdatesList;
    cacheStore.movies = allMovies;
    cacheStore.series = allSeries;
    cacheStore.anime = animeList;
    cacheStore.animeMovie = animeMovieList;
    cacheStore.hoathinh = cnHoathinhList;
    cacheStore.isLoaded = true;
  } catch (e) {
    console.error('Load data error:', e.message);
  }
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const skip = parseInt(extra.skip) || 0;
  const searchQuery = extra.search ? decodeURIComponent(extra.search).trim() : null;
  const cdn = 'https://phimimg.com';
  const limit = 50;

  if (searchQuery) {
    if (id !== 'stp_new_updates') {
      return res.json({ metas: [] });
    }
    try {
      const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=50`;
      const { data } = await axios.get(searchUrl, { timeout: 5000 });
      const items = data?.data?.items || [];
      const metas = items.map(item => ({
        id: `phimapi:${item.slug}`,
        type: item.type === 'single' ? 'movie' : 'series',
        name: item.name,
        poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
        background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
        description: `Năm: ${item.year || 'HD'}`
      }));
      return res.json({ metas });
    } catch (e) {
      return res.json({ metas: [] });
    }
  }

  if (id === 'stp_new_updates') {
    try {
      const pageToFetch = Math.floor(skip / 30) + 1;
      const { data } = await axios.get(`https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${pageToFetch}`, { timeout: 4000 });
      if (data?.items) {
        const metas = data.items.map(item => ({
          id: `phimapi:${item.slug}`,
          type: item.type === 'single' ? 'movie' : 'series',
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`,
          background: item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`,
          description: `Cập nhật: ${item.episode_current || 'HD'}`
        }));
        return res.json({ metas });
      }
    } catch (e) {}
  }

  await loadAllData();

  let fullList = [];
  if (id === 'stp_new_updates') fullList = cacheStore.newUpdates;
  else if (id === 'stp_latest_movies') fullList = cacheStore.movies;
  else if (id === 'stp_latest_series') fullList = cacheStore.series;
  else if (id === 'stp_anime') fullList = cacheStore.anime;
  else if (id === 'stp_anime_movie') fullList = cacheStore.animeMovie;
  else if (id === 'stp_hoathinh') fullList = cacheStore.hoathinh;

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

      const videos = epData.map((ep, idx) => {
        let seasonNum = 1;
        const lowerName = (ep.name || '').toLowerCase();
        
        // Nhận diện số phần/mùa từ tên tập phim (Ví dụ: "Phần 2", "Season 3", "Phần 2 - Tập 1"...)
        const match = lowerName.match(/(?:phần|season|mùa)\s*(\d+)/);
        if (match) {
          seasonNum = parseInt(match[1]) || 1;
        }

        return {
          id: `phimapi:${slug}:${ep.slug}`,
          title: ep.name.includes('Tập') ? ep.name : `Tập ${ep.name}`,
          thumbnail: thumbImg,
          season: seasonNum,
          episode: idx + 1
        };
      });

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
                                                                                      
