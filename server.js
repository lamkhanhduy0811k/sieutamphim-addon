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

const MANIFEST = {
  id: 'org.sieutamphim.nuvio',
  version: '1.2.0',
  name: 'Sưu Tầm Phim',
  description: 'Xem phim HD từ SieuTamPhim.pro',
  resources: ['catalog', 'meta', 'stream'],
  types: ['movie', 'series'],
  catalogs: [
    {
      type: 'movie',
      id: 'stp_latest_movies',
      name: 'Sưu Tầm Phim - Phim Lẻ'
    },
    {
      type: 'series',
      id: 'stp_latest_series',
      name: 'Sưu Tầm Phim - Phim Bộ'
    }
  ],
  idPrefixes: ['stp:', 'phimapi:']
};

app.get('/', (req, res) => res.send('SieuTamPhim Addon Server Online!'));
app.get('/manifest.json', (req, res) => res.json(MANIFEST));

// Lấy danh sách bài viết qua Blogger Feed JSON API
async function getBloggerFeed(label) {
  try {
    let feedUrl = 'https://www.sieutamphim.pro/feeds/posts/default?alt=json&max-results=30';
    if (label) {
      feedUrl = `https://www.sieutamphim.pro/feeds/posts/default/-/${encodeURIComponent(label)}?alt=json&max-results=30`;
    }

    const res = await axios.get(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const entries = res.data?.feed?.entry || [];
    const metas = [];

    entries.forEach(entry => {
      const title = entry.title?.$t || '';
      const linkObj = entry.link?.find(l => l.rel === 'alternate');
      const href = linkObj ? linkObj.href : '';

      if (!href || !title) return;

      let poster = entry.media$thumbnail?.url || '';
      if (!poster && entry.content?.$t) {
        const imgMatch = entry.content.$t.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (imgMatch) poster = imgMatch[1];
      }

      if (poster) {
        poster = poster.replace(/\/s\d+(-c)?\//, '/s1600/');
        if (poster.startsWith('//')) poster = 'https:' + poster;
      }

      // Tạo ID sạch từ URL bài viết Blogspot
      const cleanPath = href.replace(/^https?:\/\/[^\/]+\//, '').replace(/\.html$/, '');
      const slug = cleanPath.replace(/\//g, '-');

      if (slug && !metas.some(m => m.id === `stp:${slug}`)) {
        metas.push({
          id: `stp:${slug}`,
          type: label === 'Phim Bộ' ? 'series' : 'movie',
          name: title,
          poster: poster || 'https://via.placeholder.com/300x450?text=No+Poster',
          description: 'Sưu Tầm Phim HD'
        });
      }
    });

    return metas;
  } catch (err) {
    console.log('Blogger feed error:', err.message);
    return [];
  }
}

// Route Catalog cho Nuvio
app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { type } = req.params;
  const label = type === 'series' ? 'Phim Bộ' : 'Phim Lẻ';

  // Lớp 1: Lấy phim theo nhãn thể loại
  let metas = await getBloggerFeed(label);

  // Lớp 2: Lấy toàn bộ phim mới nhất nếu nhãn rỗng
  if (metas.length === 0) {
    metas = await getBloggerFeed(null);
  }

  // Lớp 3: Dự phòng API nếu mạng có sự cố
  if (metas.length === 0) {
    try {
      const category = type === 'series' ? 'hoat-hinh' : 'phim-le';
      const apiRes = await axios.get(`https://phimapi.com/v1/api/danh-sach/${category}?page=1`, { timeout: 8000 });
      if (apiRes.data?.data?.items) {
        const cdn = apiRes.data.data.APP_DOMAIN_CDN_IMAGE || 'https://phimimg.com';
        metas = apiRes.data.data.items.map(item => ({
          id: `phimapi:${item.slug}`,
          type: type,
          name: item.name,
          poster: item.poster_url?.startsWith('http') ? item.poster_url : `${cdn}/${item.poster_url || item.thumb_url}`,
          description: `Phim HD`
        }));
      }
    } catch (apiErr) {
      console.log('API Backup error:', apiErr.message);
    }
  }

  res.json({ metas });
});

// Route Meta (Xem chi tiết phim)
app.get(['/meta/:type/:id.json', '/meta/:type/:id/:extra.json'], async (req, res) => {
  const { id, type } = req.params;

  if (id.startsWith('phimapi:')) {
    const slug = id.replace('phimapi:', '');
    try {
      const { data } = await axios.get(`https://phimapi.com/phim/${slug}`, { timeout: 8000 });
      const movie = data?.movie || {};
      const episodes = data?.episodes?.[0]?.server_data || [];
      return res.json({
        meta: {
          id: id,
          type: type,
          name: movie.name || 'Phim',
          poster: movie.poster_url,
          description: movie.content ? movie.content.replace(/<[^>]*>?/gm, '') : '',
          videos: episodes.map(ep => ({
            id: `${id}:${ep.slug}`,
            title: ep.name
          }))
        }
      });
    } catch (e) {
      return res.json({ meta: null });
    }
  }

  const slug = id.replace('stp:', '');
  const urlPath = slug.replace(/^(\d{4})-(\d{2})-(.*)$/, '$1/$2/$3.html');
  const pageUrl = `https://www.sieutamphim.pro/${urlPath}`;

  try {
    const { data } = await axios.get(pageUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      timeout: 8000
    });
    const $ = cheerio.load(data);
    const title = $('h1').text().trim() || $('title').text().trim();
    const poster = $('.post-body img').first().attr('src') || '';

    res.json({
      meta: {
        id: id,
        type: type,
        name: title,
        poster: poster,
        description: 'Xem phim HD trên SieuTamPhim'
      }
    });
  } catch (err) {
    res.json({ meta: null });
  }
});

// Route Stream (Lấy link video)
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
        streams: ep ? [{ name: 'Server HD', title: ep.name, url: ep.link_m3u8 }] : []
      });
    } catch (e) {
      return res.json({ streams: [] });
    }
  }

  const slug = id.replace('stp:', '');
  const urlPath = slug.replace(/^(\d{4})-(\d{2})-(.*)$/, '$1/$2/$3.html');
  const pageUrl = `https://www.sieutamphim.pro/${urlPath}`;

  try {
    const { data } = await axios.get(pageUrl, {
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
        
