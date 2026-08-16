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
  version: '21.1.25',
  name: 'Sưu Tầm Phim',
  description: 'Lọc chuẩn Hoạt hình 3D Trung Quốc và Anime Nhật Bản cho Nuvio TV',
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
      name: 'Sưu Tầm Phim - Hoạt Hình 3D Trung Quốc',
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

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online v21.1.25!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

const cacheStore = {
  hot: [],
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

async function loadAllData() {
  if (cacheStore.isLoaded) return;
  try {
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
        newUpdatesList.push(createCatalogMeta(item, item.type === 'single' ? 'movie' : 'series'));
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
          allMovies.push(createCatalogMeta(item, 'movie'));
        });
      }
    });

    seriesRes.forEach(res => {
      if (res?.data?.data?.items) {
        res.data.data.items.forEach(item => {
          allSeries.push(createCatalogMeta(item, 'series'));
        });
      }
    });

    hhRes.forEach(res => {
      if (res?.data?.data?.items) {
        res.data.data.items.forEach(item => {
          const categoryStr = JSON.stringify(item.category || '').toLowerCase();
          const countryStr = JSON.stringify(item.country || '').toLowerCase();
          const nameStr = (item.name || '').toLowerCase();
          const originName = (item.origin_name || '').toLowerCase();
          const slugStr = (item.slug || '').toLowerCase();
          const contentStr = (item.content || '').toLowerCase();
          const eStr = (item.episode_current || '').toLowerCase();

          // Nhận diện Nhật Bản
          const isJapan = countryStr.includes('nhật bản') || countryStr.includes('japan') || countryStr.includes('jp') ||
                          categoryStr.includes('nhật bản') || categoryStr.includes('anime') ||
                          nameStr.includes('anime') || slugStr.includes('anime');

          // Nhận diện Trung Quốc
          const isChina = countryStr.includes('trung quốc') || countryStr.includes('china') || countryStr.includes('cn') ||
                          categoryStr.includes('trung quốc');

          if (isJapan) {
            animeList.push(createCatalogMeta(item, 'series'));

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
          } else if (isChina) {
            cnHoathinhList.push(createCatalogMeta(item, 'series'));
          }
        });
      }
    });

    // Phim Hot đan xen đa dạng
    const hotList = [];
    const seenSlugs = new Set();
    const maxLen = Math.max(allMovies.length, allSeries.length, animeMovieList.length);

    for (let i = 0; i < maxLen && hotList.length < 60; i++) {
      if (allMovies[i] && !seenSlugs.has(allMovies[i].id)) {
        seenSlugs.add(allMovies[i].id);
        hotList.push(allMovies[i]);
      }
      if (allSeries[i] && !seenSlugs.has(allSeries[i].id)) {
        seenSlugs.add(allSeries[i].id);
        hotList.push(allSeries[i]);
      }
      if (animeMovieList[i] && !seenSlugs.has(animeMovieList[i].id)) {
        seenSlugs.add(animeMovieList[i].id);
        hotList.push(animeMovieList[i]);
      }
    }

    cacheStore.hot = hotList;
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
  const limit = 50;

  if (searchQuery) {
    if (id !== 'stp_new_updates' && id !== 'stp_hot') {
      return res.json({ metas: [] });
    }
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

  if (id === 'stp_new_updates') {
    try {
      const pageToFetch = Math.floor(skip / 30) + 1;
      const { data } = await axios.get(`https://phimapi.com/danh-sach/phim-moi-cap-nhat?page=${pageToFetch}`, { timeout: 4000 });
      if (data?.items) {
        const metas = data.items.map(item => createCatalogMeta(item, item.type === 'single' ? 'movie' : 'series'));
        return res.json({ metas });
      }
    } catch (e) {}
  }

  await loadAllData();

  let fullList = [];
  if (id === 'stp_hot') fullList = cacheStore.hot;
  else if (id === 'stp_new_updates') fullList = cacheStore.newUpdates;
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

    if (!movie || !movie.content || movie.content.length < 15) {
      try {
        const { data: ncData } = await axios.get(`https://phim.nguonc.com/api/film/${slug}`, { timeout: 4000 });
        if (ncData?.movie) {
          if (!movie) {
            movie = ncData.movie;
          } else if (ncData.movie.description) {
            movie.content = ncData.movie.description;
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
app.listen(PORT, () => console.log(`Server running on port ${PORT} (Nuvio Clean v21.1.25)`));
