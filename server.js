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
  id: 'org.sieutamphim.nuvio.v2',
  version: '21.1.36',
  name: 'Sưu Tầm Phim',
  description: 'Kho phim Vietsub, Lồng Tiếng & Thuyết Minh chất lượng cao. Cập nhật liên tục phim chiếu rạp, anime và truyền hình Á - Âu.',
  logo: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=500&auto=format&fit=crop&q=60',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'stp_hot',
      name: 'Sưu Tầm Phim - Phim Hot Thịnh Hành',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_new_updates',
      name: 'Sưu Tầm Phim - Phim Mới & Tìm Kiếm',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_longtieng',
      name: 'Sưu Tầm Phim - Phim Lồng Tiếng',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_chieurap',
      name: 'Sưu Tầm Phim - Phim Chiếu Rạp',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_vietnam',
      name: 'Sưu Tầm Phim - Phim Việt Nam',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hanquoc',
      name: 'Sưu Tầm Phim - Phim Hàn Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_trungquoc',
      name: 'Sưu Tầm Phim - Phim Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hongkong',
      name: 'Sưu Tầm Phim - Phim Hồng Kông',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_anime',
      name: 'Sưu Tầm Phim - Anime Nhật Bản',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_anime_movie',
      name: 'Sưu Tầm Phim - Movie Anime Chiếu Rạp',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hoathinh',
      name: 'Sưu Tầm Phim - Hoạt Hình Trung Quốc',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'movie',
      id: 'stp_latest_movies',
      name: 'Sưu Tầm Phim - Phim Lẻ',
      extra: [{ name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_latest_series',
      name: 'Sưu Tầm Phim - Phim Bộ',
      extra: [{ name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v21.1.36!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

function getCleanPlot(item) {
  let raw = item.content || item.description || '';
  let clean = raw.replace(/<[^>]*>?/gm, '').trim();
  if (clean && clean.length > 15 && clean !== 'Đang cập nhật') {
    return clean;
  }
  return `${item.origin_name ? item.origin_name + ' • ' : ''}${item.episode_current || 'HD'} (${item.year || '2026'})`;
}

function createCatalogMeta(item, defaultType) {
  const cdn = 'https://phimimg.com';
  const p = item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`;
  const b = item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`;
  
  const genres = Array.isArray(item.category) 
    ? item.category.map(c => c.name || c).filter(Boolean) 
    : ['Phim Vietsub'];

  const yearStr = item.year ? String(item.year) : '2026';
  const epStr = item.episode_current || 'HD';

  return {
    id: `phimapi:${item.slug}`,
    type: item.type === 'single' ? 'movie' : (item.type === 'series' ? 'series' : defaultType),
    name: item.name,
    poster: p,
    background: b || p,
    description: getCleanPlot(item),
    genres: genres,
    releaseInfo: `${yearStr} • ${epStr}`,
    posterShape: 'poster'
  };
}

const API_MAP = {
  'stp_chieurap': 'https://phimapi.com/v1/api/danh-sach/phim-chieu-rap',
  'stp_longtieng': 'https://phimapi.com/v1/api/danh-sach/phim-le',
  'stp_vietnam': 'https://phimapi.com/v1/api/quoc-gia/viet-nam',
  'stp_hanquoc': 'https://phimapi.com/v1/api/quoc-gia/han-quoc',
  'stp_trungquoc': 'https://phimapi.com/v1/api/quoc-gia/trung-quoc',
  'stp_hongkong': 'https://phimapi.com/v1/api/quoc-gia/hong-kong',
  'stp_anime': 'https://phimapi.com/v1/api/danh-sach/hoat-hinh',
  'stp_anime_movie': 'https://phimapi.com/v1/api/danh-sach/phim-le', // Chuyển sang nguồn phim lẻ để lọc chuẩn xác anime chiếu rạp
  'stp_hoathinh': 'https://phimapi.com/v1/api/danh-sach/hoat-hinh',
  'stp_latest_movies': 'https://phimapi.com/v1/api/danh-sach/phim-le',
  'stp_latest_series': 'https://phimapi.com/v1/api/danh-sach/phim-bo',
  'stp_hot': 'https://phimapi.com/danh-sach/phim-moi-cap-nhat'
};

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const skip = parseInt(extra.skip) || 0;
  const searchQuery = extra.search ? decodeURIComponent(extra.search).trim() : null;

  if (searchQuery) {
    try {
      const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=50`;
      const { data } = await axios.get(searchUrl, { timeout: 5000 });
      const items = data?.data?.items || [];
      const metas = items.map(item => createCatalogMeta(item, item.type === 'single' ? 'movie' : 'series'));
      return res.json({ metas });
    } catch (e) {
      return res.json({ metas: [] });
    }
  }

  const pageToFetch = Math.floor(skip / 30) + 1;
  const apiUrl = API_MAP[id] || `https://phimapi.com/danh-sach/phim-moi-cap-nhat`;

  try {
    const { data } = await axios.get(`${apiUrl}?page=${pageToFetch}&limit=40`, { timeout: 4000 });
    let items = data?.data?.items || data?.items || [];

    if (id === 'stp_anime') {
      items = items.filter(i => {
        const cStr = JSON.stringify(i.country || '').toLowerCase();
        return cStr.includes('nhật bản') || cStr.includes('japan');
      });
    } else if (id === 'stp_anime_movie') {
      // Lọc các phim lẻ thuộc Nhật Bản hoặc có chứa từ khóa anime/hoạt hình
      items = items.filter(i => {
        const cStr = JSON.stringify(i.country || '').toLowerCase();
        const catStr = JSON.stringify(i.category || '').toLowerCase();
        const nameStr = (i.name || '').toLowerCase();
        const isJapan = cStr.includes('nhật bản') || cStr.includes('japan') || catStr.includes('hoạt hình') || nameStr.includes('shin') || nameStr.includes('conan') || nameStr.includes('doraemon');
        return isJapan;
      });
    } else if (id === 'stp_hoathinh') {
      items = items.filter(i => {
        const cStr = JSON.stringify(i.country || '').toLowerCase();
        return cStr.includes('trung quốc') || cStr.includes('china');
      });
    }

    const defaultType = (id === 'stp_chieurap' || id === 'stp_anime_movie' || id === 'stp_latest_movies') ? 'movie' : 'series';
    const metas = items.map(item => createCatalogMeta(item, defaultType));
    return res.json({ metas });
  } catch (e) {
    return res.json({ metas: [] });
  }
});

app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;

  if (id.startsWith('phimapi:')) {
    const slug = id.replace('phimapi:', '').split(':')[0];
    let movie = null;
    let epData = [];

    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 4000 });
      if (data?.movie) {
        movie = data.movie;
        epData = data?.episodes?.[0]?.server_data || [];
      }
    } catch (e) {}

    if (!movie) return res.json({ meta: null });

    const p = movie.poster_url?.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
    const b = movie.thumb_url?.startsWith('http') ? movie.thumb_url : `https://phimimg.com/${movie.thumb_url}`;
    const thumbImg = b || p;

    const genres = Array.isArray(movie.category) 
      ? movie.category.map(c => c.name || c).filter(Boolean) 
      : ['Phim Vietsub'];

    const director = Array.isArray(movie.director) ? movie.director.filter(d => d && d !== 'Đang cập nhật') : [];
    const cast = Array.isArray(movie.actor) ? movie.actor.filter(a => a && a !== 'Đang cập nhật') : [];

    let cleanDescription = (movie.content || movie.description || '').replace(/<[^>]*>?/gm, '').trim();

    const videos = epData.map((ep, idx) => ({
      id: `phimapi:${slug}:${ep.slug}`,
      title: ep.name || `Tập ${idx + 1}`,
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
        description: cleanDescription,
        genres: genres,
        director: director,
        cast: cast,
        releaseInfo: movie.year ? String(movie.year) : undefined,
        videos: videos
      }
    });
  }

  res.json({ meta: null });
});

app.get(['/stream/:type/:id.json', '/stream/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;

  if (id.startsWith('phimapi:')) {
    const parts = id.split(':');
    const slug = parts[1];
    const epSlug = parts[2];
    
    let streams = [];

    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 4000 });
      const servers = data?.episodes || [];
      servers.forEach((srv, sIdx) => {
        const episodes = srv.server_data || [];
        const ep = episodes.find(e => e.slug === epSlug) || episodes[0];
        if (ep && ep.link_m3u8) {
          streams.push({
            name: `Server FHD [${srv.server_name || `Nguồn ${sIdx + 1}`}]`,
            title: ep.name || 'Phát chính',
            url: ep.link_m3u8
          });
        }
      });
    } catch (e) {}

    return res.json({ streams });
  }

  res.json({ streams: [] });
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Server running on port ${PORT} (Nuvio Fast v21.1.36)`));
        
