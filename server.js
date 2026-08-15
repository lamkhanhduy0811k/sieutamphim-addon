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

// Hàm xử lý ảnh Blogspot về độ phân giải gốc nét nhất
function fixImgUrl(url) {
  if (!url) return '';
  let fixed = url
    .replace(/\/s\d+(-c)?\//, '/s1600/')
    .replace(/\/w\d+-h\d+[^/]*\//, '/s1600/')
    .replace(/\/s\d+[^/]*\//, '/s1600/');
  if (fixed.startsWith('//')) fixed = 'https:' + fixed;
  return fixed;
}

const MANIFEST = {
  id: 'org.sieutamphim.nuvio',
  version: '1.4.0',
  name: 'Sưu Tầm Phim',
  description: 'Xem phim HD nét cao từ SieuTamPhim.pro',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    { type: 'movie', id: 'stp_latest_movies', name: 'Sưu Tầm Phim - Phim Lẻ' },
    { type: 'series', id: 'stp_latest_series', name: 'Sưu Tầm Phim - Phim Bộ' }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

async function getBloggerFeed(label) {
  try {
    let feedUrl = 'https://www.sieutamphim.pro/feeds/posts/default?alt=json&max-results=30';
    if (label) {
      feedUrl = `https://www.sieutamphim.pro/feeds/posts/default/-/${encodeURIComponent(label)}?alt=json&max-results=30`;
    }

    const res = await axios.get(feedUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
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
          type: label === 'Phim Bộ' ? 'series' : 'movie',
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
  const { type } = req.params;
  const label = type === 'series' ? 'Phim Bộ' : 'Phim Lẻ';

  let metas = await getBloggerFeed(label);
  if (metas.length === 0) metas = await getBloggerFeed(null);

  if (metas.length === 0) {
    try {
      const category = type === 'series' ? 'hoat-hinh' : 'phim-le';
      const apiRes = await axios.get(`https://phimapi.com/v1/api/danh-sach/${category}?page=1`, { timeout: 8000 });
      if (apiRes.data?.data?.items) {
        const cdn = apiRes.data.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
        metas = apiRes.data.data.items.map(item => {
          const p = item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url}`;
          const b = item.thumb_url?.startsWith('http') ? item.thumb_url : `${cdn}/${item.thumb_url}`;
          return {
            id: `phimapi:${item.slug}`,
            type: type,
            name: item.name,
            poster: p,
            background: b || p,
            description: `Phim HD`
          };
        });
      }
    } catch (e) {}
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
          name: movie.name || 'Phim',
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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    const $ = cheerio.load(data);
    const title = $('h1').text().trim() || $('title').text().trim();
    let rawImg = $('.post-body img').first().attr('src') || '';
    const posterHD = fixImgUrl(rawImg);

    const videos = [];
    $('.list-episode a, .episode-list a, .list-server a, #list-episode a, a.btn-episode, .halim-list-eps a').each((i, el) => {
      const epTitle = $(el).text().trim() || `Tập ${i + 1}`;
      const epUrl = $(el).attr('href') || $(el).attr('data-embed') || '';
      if (epUrl) {
        videos.push({
          id: `stp:${slug}::${encodeURIComponent(epUrl)}::${i + 1}`,
          title: epTitle,
          season: 1,
          episode: i + 1
        });
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
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
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
