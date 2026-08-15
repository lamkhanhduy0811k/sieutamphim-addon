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

function fixImgUrl(url) {
  if (!url) return '';
  let fixed = url
    .replace(/\/s\d+(-c)?\//, '/s1600/')
    .replace(/\/w\d+-h\d+[^/]*\//, '/s1600/')
    .replace(/\/s\d+[^/]*\//, '/s1600/');
  if (fixed.startsWith('//')) fixed = 'https:' + fixed;
  return fixed;
}

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
  version: '1.8.0',
  name: 'Sưu Tầm Phim',
  description: 'Xem phim HD, Phim bộ, Anime Nhật & Hoạt hình Trung Quốc',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'stp_latest_movies',
      name: 'Sưu Tầm Phim - Phim Lẻ',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_latest_series',
      name: 'Sưu Tầm Phim - Phim Bộ',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_anime',
      name: 'Sưu Tầm Phim - Anime (Nhật Bản)',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    },
    {
      type: 'series',
      id: 'stp_hoathinh_trungquoc',
      name: 'Sưu Tầm Phim - Hoạt Hình Trung Quốc',
      extra: [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

async function getBloggerFeed(label, query = '', skip = 0, limit = 100) {
  try {
    const startIndex = skip + 1;
    let baseUrl = 'https://www.sieutamphim.pro/feeds/posts/default';
    if (label && !query) {
      baseUrl = `https://www.sieutamphim.pro/feeds/posts/default/-/${encodeURIComponent(label)}`;
    }

    let feedUrl = `${baseUrl}?alt=json&max-results=${limit}&start-index=${startIndex}`;
    if (query) {
      feedUrl += `&q=${encodeURIComponent(query)}`;
    }

    const res = await axios.get(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    const entries = res.data?.feed?.entry || [];
    const metas = [];

    entries.forEach(entry => {
      const title = entry.title?.$t || '';
      const linkObj = entry.link?.find(l => l.rel === 'alternate');
      const href = linkObj ? linkObj.href : '';

      if (!href || !title) return;

      let rawImg = entry.media$thumbnail?.url || '';
      if (!rawImg && entry.content?.$t) {
        const imgMatch = entry.content.$t.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) rawImg = imgMatch[1];
      }

      const posterHD = fixImgUrl(rawImg);
      const cleanPath = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\.html$/, '');
      const slug = cleanPath.replace(/\//g, '-');

      if (slug && !metas.some(m => m.id === `stp:${slug}`)) {
        metas.push({
          id: `stp:${slug}`,
          type: 'series',
          name: title,
          poster: posterHD || 'https://via.placeholder.com/300x450?text=No+Poster',
          background: posterHD,
          description: 'Sưu Tầm Phim HD'
        });
      }
    });

    return metas;
  } catch (err) {
    return [];
  }
}

app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { type, id, extra: extraStr } = req.params;
  const extra = parseExtra(extraStr);
  const searchQuery = extra.search || '';
  const skip = parseInt(extra.skip) || 0;

  let metas = [];

  if (id === 'stp_anime') {
    metas = await getBloggerFeed('Anime', searchQuery, skip, 100);
  } else if (id === 'stp_hoathinh_trungquoc') {
    try {
      let page = Math.floor(skip / 24) + 1;
      let apiUrl = searchQuery 
        ? `https://phimapi.com/v1/api/tim-kiem?keyword=${encodeURIComponent(searchQuery)}&limit=50`
        : `https://phimapi.com/v1/api/danh-sach/hoat-hinh?page=${page}&limit=50`;

      const apiRes = await axios.get(apiUrl, { timeout: 8000 });
      if (apiRes.data?.data?.items) {
        const cdn = apiRes.data.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
        metas = apiRes.data.data.items.map(item => {
          const p = item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`;
          const b = item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`;
          return {
            id: `phimapi:${item.slug}`,
            type: 'series',
            name: item.name,
            poster: p,
            background: b || p,
            description: `Hoạt hình Trung Quốc HD`
          };
        });
      }
    } catch (e) {}
  } else {
    let label = (type === 'series') ? 'Phim Bộ' : 'Phim Lẻ';
    metas = await getBloggerFeed(label, searchQuery, skip, 100);
  }

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

      const videos = epData.map((ep, idx) => ({
        id: `phimapi:${slug}:${ep.slug}`,
        title: ep.name.includes('Tập') ? ep.name : `Tập ${ep.name}`,
        season: 1,
        episode: idx + 1
      }));

      return res.json({
        meta: {
          id: `phimapi:${slug}`,
          type: type,
          name: movie.name || 'Hoạt Hình',
          poster: p,
          background: b || p,
          description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : '',
          videos: videos.length > 0 ? videos : [{ id: `phimapi:${slug}:full`, title: 'Tập 1', season: 1, episode: 1 }]
        }
      });
    } catch (e) {
      return res.json({ meta: null });
    }
  }

  const cleanId = id.split('::')[0];
  const slug = cleanId.replace('stp:', '');
  const urlPath = slug.replace(/^(\d{4})-(\d{2})-(.*)$/, '$1/$2/$3.html');
  const pageUrl = `https://www.sieutamphim.pro/${urlPath}`;

  try {
    const { data } = await axios.get(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });
    const $ = cheerio.load(data);
    const title = $('h1').text().trim() || $('title').text().trim();
    let rawImg = $('.post-body img').first().attr('src') || '';
    const posterHD = fixImgUrl(rawImg);

    const videos = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href') || '';
      const text = $(el).text().trim();
      if ((text.includes('Tập') || text.match(/^\d+$/)) && href && !href.includes('facebook') && !href.includes('zalo')) {
        if (!videos.some(v => v.title === text)) {
          videos.push({
            id: `stp:${slug}::${encodeURIComponent(href)}::${videos.length + 1}`,
            title: text.includes('Tập') ? text : `Tập ${text}`,
            season: 1,
            episode: videos.length + 1
          });
        }
      }
    });

    if (videos.length === 0) {
      videos.push({
        id: `stp:${slug}::full::1`,
        title: 'Tập 1 / Phim Full',
        season: 1,
        episode: 1
      });
    }

    res.json({
      meta: {
        id: `stp:${slug}`,
        type: type,
        name: title,
        poster: posterHD,
        background: posterHD,
        description: $('meta[name="description"]').attr('content') || title,
        videos: videos
      }
    });
  } catch (err) {
    res.json({ meta: null });
  }
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

  try {
    let targetLink = '';
    if (id.includes('::')) {
      const parts = id.split('::');
      const rawUrl = decodeURIComponent(parts[1]);
      if (rawUrl !== 'full') targetLink = rawUrl;
    }

    if (!targetLink) {
      const cleanId = id.split('::')[0];
      const slug = cleanId.replace('stp:', '');
      const urlPath = slug.replace(/^(\d{4})-(\d{2})-(.*)$/, '$1/$2/$3.html');
      targetLink = `https://www.sieutamphim.pro/${urlPath}`;
    }

    const { data } = await axios.get(targetLink, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 8000
    });

    const $ = cheerio.load(data);
    let streamUrl = $('iframe#player').attr('src') || $('iframe[src*="http"]').attr('src') || $('iframe').attr('src');

    if (!streamUrl) return res.json({ streams: [] });
    if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;

    res.json({
      streams: [{ name: 'Sưu Tầm Phim', title: 'Full HD', url: streamUrl }]
    });
  } catch (err) {
    res.json({ streams: [] });
  }
});

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  
