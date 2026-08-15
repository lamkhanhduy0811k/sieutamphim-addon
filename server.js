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
  version: '21.1.6',
  name: 'Sưu Tầm Phim',
  description: 'Kho khổng lồ 500+ bộ mỗi danh mục: Phim Mới Cập Nhật, Phim Lẻ, Phim Bộ, Anime Nhật, Movie Anime & Hoạt hình Trung Quốc',
  logo: 'https://i.ibb.co/689Q287/1000004533.jpg',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'stp_new_updates', name: 'Sưu Tầm Phim - Phim Mới & Tìm Kiếm', extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'stp_latest_movies', name: 'Sưu Tầm Phim - Phim Lẻ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'stp_latest_series', name: 'Sưu Tầm Phim - Phim Bộ', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'stp_anime', name: 'Sưu Tầm Phim - Anime Nhật Bản', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'movie', id: 'stp_anime_movie', name: 'Sưu Tầm Phim - Movie Anime', extra: [{ name: 'skip', isRequired: false }] },
    { type: 'series', id: 'stp_hoathinh', name: 'Sưu Tầm Phim - Hoạt Hình TQ', extra: [{ name: 'skip', isRequired: false }] }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v21.1.6!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const cache = { data: {}, isLoaded: false };

async function loadAllData() {
  if (cache.isLoaded) return;
  const cdn = 'https://phimimg.com';
  try {
    const [mRes, sRes, hRes] = await Promise.all([
      axios.get('https://phimapi.com/v1/api/danh-sach/phim-le?limit=50').catch(() => null),
      axios.get('https://phimapi.com/v1/api/danh-sach/phim-bo?limit=50').catch(() => null),
      axios.get('https://phimapi.com/v1/api/danh-sach/hoat-hinh?limit=50').catch(() => null)
    ]);
    
    cache.data.movies = (mRes?.data?.data?.items || []).map(i => ({ id: `phimapi:${i.slug}`, type: 'movie', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}`, description: 'Phim Lẻ' }));
    cache.data.series = (sRes?.data?.data?.items || []).map(i => ({ id: `phimapi:${i.slug}`, type: 'series', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}`, description: 'Phim Bộ' }));
    
    const allHh = (hRes?.data?.data?.items || []);
    cache.data.anime = allHh.filter(i => (i.country || '').toLowerCase().includes('nhật')).map(i => ({ id: `phimapi:${i.slug}`, type: 'series', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}`, description: 'Anime Nhật' }));
    cache.data.animeMovie = allHh.filter(i => (i.country || '').toLowerCase().includes('nhật') && (i.type === 'movie' || i.name.toLowerCase().includes('movie'))).map(i => ({ id: `phimapi:${i.slug}`, type: 'movie', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}`, description: 'Movie Anime' }));
    cache.data.hoathinh = allHh.filter(i => !(i.country || '').toLowerCase().includes('nhật')).map(i => ({ id: `phimapi:${i.slug}`, type: 'series', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}`, description: 'Hoạt hình TQ' }));
    
    cache.isLoaded = true;
  } catch (e) {}
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const skip = parseInt(extra.skip) || 0;
  const search = extra.search ? decodeURIComponent(extra.search) : null;
  const cdn = 'https://phimimg.com';

  if (search && id === 'stp_new_updates') {
    try {
      const { data } = await axios.get(`https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(search)}`);
      return res.json({ metas: (data?.data?.items || []).map(i => ({ id: `phimapi:${i.slug}`, type: i.type === 'single' ? 'movie' : 'series', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}` })) });
    } catch (e) { return res.json({ metas: [] }); }
  }

  if (id === 'stp_new_updates' && !search) {
    const { data } = await axios.get('https://phimapi.com/danh-sach/phim-moi-cap-nhat');
    return res.json({ metas: (data?.items || []).map(i => ({ id: `phimapi:${i.slug}`, type: i.type === 'single' ? 'movie' : 'series', name: i.name, poster: i.poster_url?.startsWith('http') ? i.poster_url : `${cdn}/${i.poster_url}` })) });
  }

  await loadAllData();
  const map = { stp_latest_movies: 'movies', stp_latest_series: 'series', stp_anime: 'anime', stp_anime_movie: 'animeMovie', stp_hoathinh: 'hoathinh' };
  res.json({ metas: (cache.data[map[id]] || []).slice(skip, skip + 50) });
});

app.get('/meta/:type/:id.json', async (req, res) => {
  const { id } = req.params;
  const slug = id.replace('phimapi:', '');
  try {
    const { data } = await axios.get(`https://phimapi.com/phim/${slug}`);
    const m = data.movie;
    res.json({ meta: { id, type: req.params.type, name: m.name, poster: m.poster_url, background: m.thumb_url, description: m.content.replace(/<[^>]*>?/gm, ''), videos: (data.episodes[0].server_data || []).map((e, idx) => ({ id: `phimapi:${slug}:${e.slug}`, title: e.name, season: 1, episode: idx + 1 })) } });
  } catch (e) { res.json({ meta: null }); }
});

app.get('/stream/:type/:id.json', async (req, res) => {
  const [_, slug, epSlug] = req.params.id.split(':');
  const { data } = await axios.get(`https://phimapi.com/phim/${slug}`);
  const ep = data.episodes[0].server_data.find(e => e.slug === epSlug) || data.episodes[0].server_data[0];
  res.json({ streams: [{ name: 'Full HD', url: ep.link_m3u8 }] });
});

app.listen(process.env.PORT || 7000);
        
