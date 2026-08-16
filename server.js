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
  version: '21.1.31',
  name: 'Sưu Tầm Phim',
  description: 'Addon xem phim đa dạng nguồn cho Nuvio TV',
  logo: 'https://i.ibb.co/689Q287/1000004533.jpg',
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

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v21.1.31!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const cacheStore = {};

const strictBlacklist = [
  'mặt cười', 'laughing man', 'stand alone complex', 's.a.c', 
  'lord el-melloi', 'rail zeppelin', 'case files', 'grand blue', 
  '100 cô bạn gái', 'yozakura', 'hell mode', 'cậu và tớ', 'nữ hùng',
  'oakhaven', 'phần 2', 'phần 3', 'season 2', 'season 3', 'ss2', 'ss3'
];

function isAnimation(item) {
  const categoryStr = JSON.stringify(item.category || '').toLowerCase();
  const typeStr = (item.type || '').toLowerCase();
  const slugStr = (item.slug || '').toLowerCase();

  return typeStr === 'hoathinh' || 
         categoryStr.includes('hoạt hình') || 
         categoryStr.includes('hoathinh') || 
         categoryStr.includes('anime') ||
         slugStr.includes('hoat-hinh');
}

function isLongTieng(item) {
  const nameStr = (item.name || '').toLowerCase();
  const langStr = (item.lang || '').toLowerCase();
  const epStr = (item.episode_current || '').toLowerCase();

  return langStr.includes('lồng tiếng') || langStr.includes('thuyết minh') ||
         nameStr.includes('lồng tiếng') || nameStr.includes('thuyết minh') ||
         epStr.includes('lồng tiếng') || epStr.includes('thuyết minh');
}

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

async function fetchRawInBatches(url, totalPages, filterFn = null) {
  const list = [];
  const seenSlugs = new Set();
  const batchSize = 4;

  for (let i = 1; i <= totalPages; i += batchSize) {
    const promises = [];
    for (let p = i; p < i + batchSize && p <= totalPages; p++) {
      promises.push(axios.get(`${url}?page=${p}&limit=50`, { timeout: 6000 }).catch(() => null));
    }
    const results = await Promise.all(promises);
    results.forEach(res => {
      if (res?.data?.data?.items) {
        res.data.data.items.forEach(item => {
          if (!seenSlugs.has(item.slug)) {
            if (filterFn && !filterFn(item)) return;
            seenSlugs.add(item.slug);
            list.push(item);
          }
        });
      }
    });
  }
  return list;
}

async function getCatalogItems(id) {
  if (cacheStore[id] && cacheStore[id].length > 0) {
    return cacheStore[id];
  }

  let items = [];
  if (id === 'stp_chieurap') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/phim-chieu-rap', 12);
    items = raw.map(i => createCatalogMeta(i, 'movie'));
  } else if (id === 'stp_longtieng') {
    const rawMovies = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/phim-le', 12, isLongTieng);
    const rawSeries = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/phim-bo', 12, isLongTieng);
    const combined = [...rawMovies, ...rawSeries];
    items = combined.map(i => createCatalogMeta(i, i.type === 'single' ? 'movie' : 'series'));
  } else if (id === 'stp_vietnam') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/quoc-gia/viet-nam', 18, item => !isAnimation(item));
    items = raw.map(i => createCatalogMeta(i, 'series'));
  } else if (id === 'stp_hanquoc') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/quoc-gia/han-quoc', 14, item => !isAnimation(item));
    items = raw.map(i => createCatalogMeta(i, 'series'));
  } else if (id === 'stp_trungquoc') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/quoc-gia/trung-quoc', 18, item => !isAnimation(item));
    items = raw.map(i => createCatalogMeta(i, 'series'));
  } else if (id === 'stp_hongkong') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/quoc-gia/hong-kong', 14, item => !isAnimation(item));
    items = raw.map(i => createCatalogMeta(i, 'series'));
  } else if (id === 'stp_latest_movies') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/phim-le', 12);
    items = raw.map(i => createCatalogMeta(i, 'movie'));
  } else if (id === 'stp_latest_series') {
    const raw = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/phim-bo', 12);
    items = raw.map(i => createCatalogMeta(i, 'series'));
  } else if (id === 'stp_anime' || id === 'stp_anime_movie' || id === 'stp_hoathinh') {
    const rawList = await fetchRawInBatches('https://phimapi.com/v1/api/danh-sach/hoat-hinh', 22);
    const animeList = [];
    const animeMovieList = [];
    const cnHoathinhList = [];

    rawList.forEach(item => {
      const countryStr = JSON.stringify(item.country || '').toLowerCase();
      const categoryStr = JSON.stringify(item.category || '').toLowerCase();
      const nameStr = (item.name || '').toLowerCase();
      const originName = (item.origin_name || '').toLowerCase();
      const slugStr = (item.slug || '').toLowerCase();
      const contentStr = (item.content || '').toLowerCase();
      const eStr = (item.episode_current || '').toLowerCase();

      const isChina = countryStr.includes('trung quốc') || countryStr.includes('china') || categoryStr.includes('trung quốc');
      const isJapan = countryStr.includes('nhật bản') || countryStr.includes('japan') || categoryStr.includes('nhật bản');

      if (isChina) {
        cnHoathinhList.push(createCatalogMeta(item, 'series'));
      } else if (isJapan || categoryStr.includes('anime') || nameStr.includes('anime')) {
        const metaObj = createCatalogMeta(item, 'series');
        animeList.push(metaObj);

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
          animeMovieList.push(createCatalogMeta(item, 'movie'));
        }
      }
    });

    cacheStore['stp_anime'] = animeList;
    cacheStore['stp_anime_movie'] = animeMovieList;
    cacheStore['stp_hoathinh'] = cnHoathinhList;
    return cacheStore[id] || [];
  } else if (id === 'stp_hot') {
    const movies = await getCatalogItems('stp_latest_movies');
    const series = await getCatalogItems('stp_latest_series');
    const hotList = [];
    const seen = new Set();
    const maxLen = Math.max(movies.length, series.length);

    for (let i = 0; i < maxLen && hotList.length < 60; i++) {
      if (movies[i] && !seen.has(movies[i].id)) {
        seen.add(movies[i].id);
        hotList.push(movies[i]);
      }
      if (series[i] && !seen.has(series[i].id)) {
        seen.add(series[i].id);
        hotList.push(series[i]);
      }
    }
    items = hotList;
  }

  cacheStore[id] = items;
  return items;
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const skip = parseInt(extra.skip) || 0;
  const searchQuery = extra.search ? decodeURIComponent(extra.search).trim() : null;
  const limit = 50;

  if (searchQuery) {
    if (id !== 'stp_new_updates' && id !== 'stp_hot') {
      return res.json({ metas: [] });
    }
    try {
      const searchUrl = `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=50`;
      const { data } = await axios.get(searchUrl, { timeout: 6000 });
      const items = data?.data?.items || [];
      const metas = items.map(item => createCatalogMeta(item, item.type === 'single' ? 'movie' : 'series'));
      return res.json({ metas });
    } catch (e) {
      return res.json({ metas: [] });
    }
  }

  if (id === 'stp_new_updates') {
    try {
      const pageToFetch = Math.floor(skip / 30) + 1;
      const { data } = await axios.get(`https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${pageToFetch}`, { timeout: 5000 });
      if (data?.items) {
        const metas = data.items.map(item => createCatalogMeta(item, item.type === 'single' ? 'movie' : 'series'));
        return res.json({ metas });
      }
    } catch (e) {}
  }

  const fullList = await getCatalogItems(id);
  const metas = fullList.slice(skip, skip + limit);
  res.json({ metas });
});

app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;

  if (id.startsWith('phimapi:')) {
    const slug = id.replace('phimapi:', '').split(':')[0];
    let movie = null;
    let epData = [];

    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 5000 });
      if (data?.movie) {
        movie = data.movie;
        epData = data?.episodes?.[0]?.server_data || [];
      }
    } catch (e) {}

    if (!movie || !movie.content || movie.content.length < 15) {
      try {
        const { data: opData } = await axios.get(`https://ophim1.com/phim/${slug}`, { timeout: 4000 });
        if (opData?.movie) {
          if (!movie) {
            movie = opData.movie;
            epData = opData?.episodes?.[0]?.server_data || [];
          } else {
            if (opData.movie.content) movie.content = opData.movie.content;
            if (opData.movie.actor) movie.actor = opData.movie.actor;
            if (opData.movie.director) movie.director = opData.movie.director;
            if (opData.movie.category) movie.category = opData.movie.category;
          }
        }
      } catch (e) {}
    }

    if (!movie) return res.json({ meta: null });

    const p = movie.poster_url?.startsWith('http') ? movie.poster_url : `https://phimimg.com/${movie.poster_url}`;
    const b = movie.thumb_url?.startsWith('http') ? movie.thumb_url : `https://phimimg.com/${movie.thumb_url}`;
    const thumbImg = b || p;

    const genres = Array.isArray(movie.category) 
      ? movie.category.map(c => c.name || c).filter(Boolean) 
      : ['Phim Vietsub'];

    const director = Array.isArray(movie.director) 
      ? movie.director.filter(d => d && d !== 'Đang cập nhật') 
      : [];

    const cast = Array.isArray(movie.actor) 
      ? movie.actor.filter(a => a && a !== 'Đang cập nhật') 
      : [];

    let cleanDescription = (movie.content || movie.description || '')
      .replace(/<[^>]*>?/gm, '')
      .trim();

    if (!cleanDescription || cleanDescription === 'Đang cập nhật' || cleanDescription.length < 10) {
      const gStr = genres.length ? genres.join(', ') : 'Phim Hay';
      const countryStr = Array.isArray(movie.country) ? movie.country.map(c => c.name || c).join(', ') : 'Châu Á';
      cleanDescription = `🎬 [Thông Tin Phim]\n\n• Tên phim: ${movie.name || 'Đang cập nhật'}\n• Tên gốc: ${movie.origin_name || movie.name || 'N/A'}\n• Thể loại: ${gStr}\n• Trạng thái: ${movie.episode_current || 'Hoàn tất'} (${movie.quality || 'FHD'})\n• Quốc gia: ${countryStr}\n• Năm phát hành: ${movie.year || 'Mới cập nhật'}\n\nNội dung chi tiết đang được đồng bộ tự động. Bạn có thể bấm Phát để thưởng thức bộ phim ngay bây giờ!`;
    }

    const videos = epData.map((ep, idx) => {
      let seasonNum = 1;
      let episodeNum = idx + 1;
      const lowerName = (ep.name || '').toLowerCase();
      
      const textMatch = lowerName.match(/(?:phần|season|mùa|ss)\s*([ivx0-9]+)/);
      if (textMatch) {
          const roman = { 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8, 'ix': 9, 'x': 10 };
          seasonNum = roman[textMatch[1]] || parseInt(textMatch[1]) || 1;
      }

      const epMatch = lowerName.match(/(?:tập|ep)\s*(\d+)/);
      if (epMatch) {
          episodeNum = parseInt(epMatch[1]);
      }

      return {
        id: `phimapi:${slug}:${ep.slug}`,
        title: ep.name || `Tập ${idx + 1}`,
        thumbnail: thumbImg,
        season: parseInt(seasonNum),
        episode: parseInt(episodeNum)
      };
    });

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
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 5000 });
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

    try {
      const { data: opData } = await axios.get(`https://ophim1.com/phim/${slug}`, { timeout: 4000 });
      const opServers = opData?.episodes || [];
      opServers.forEach((srv, sIdx) => {
        const episodes = srv.server_data || [];
        const ep = episodes.find(e => e.slug === epSlug) || episodes[0];
        if (ep && ep.link_m3u8) {
          streams.push({
            name: `Server Dự Phòng [Ophim - ${srv.server_name || 'VIP'}]`,
            title: ep.name || 'Dự phòng',
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
app.listen(PORT, () => console.log(`Server running on port ${PORT} (Nuvio Clean v21.1.31)`));
                                        
