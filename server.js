const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

// Cấu hình CORS mở rộng cho Nuvio
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', '*');
  next();
});

const MANIFEST = {
  id: 'org.sieutamphim.nuvio',
  version: '1.0.0',
  name: 'Sưu Tầm Phim',
  description: 'Xem phim lẻ và phim bộ HD từ SieuTamPhim.pro',
  resources: ['catalog', 'stream'],
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
  idPrefixes: ['stp:']
};

app.get('/manifest.json', (req, res) => res.json(MANIFEST));

// Route Catalog cho Phim lẻ và Phim bộ
app.get(['/catalog/:type/:id.json', '/catalog/:type/:id/:extra.json'], async (req, res) => {
  const { type } = req.params;
  const targetUrl = type === 'series' 
    ? 'https://www.sieutamphim.pro/danh-sach/phim-bo' 
    : 'https://www.sieutamphim.pro/danh-sach/phim-le';

  try {
    const { data } = await axios.get(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(data);
    const metas = [];

    $('a[href*="/phim/"]').each((i, el) => {
      const href = $(el).attr('href') || '';
      const img = $(el).find('img').first();
      let poster = img.attr('src') || img.attr('data-src') || '';
      let title = $(el).attr('title') || img.attr('alt') || $(el).text().trim();

      if (href && href.includes('/phim/')) {
        const slug = href.split('/').filter(Boolean).pop().replace('.html', '');
        if (poster && poster.startsWith('//')) poster = 'https:' + poster;

        if (slug && !metas.some(m => m.id === `stp:${slug}`)) {
          metas.push({
            id: `stp:${slug}`,
            type: type,
            name: title ? title.split('\n')[0].trim() : slug,
            poster: poster,
            description: 'Sưu Tầm Phim HD'
          });
        }
      }
    });

    res.json({ metas });
  } catch (err) {
    res.json({ metas: [] });
  }
});

// Route Stream lấy link phát video
app.get(['/stream/:type/:id.json', '/stream/:type/:id/:extra.json'], async (req, res) => {
  const { id } = req.params;
  const slug = id.replace('stp:', '');
  const pageUrl = `https://www.sieutamphim.pro/phim/${slug}`;

  try {
    const { data } = await axios.get(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 8000
    });

    const $ = cheerio.load(data);
    let streamUrl = $('iframe#player').attr('src') || $('iframe').attr('src');

    if (!streamUrl) return res.json({ streams: [] });
    if (streamUrl.startsWith('//')) streamUrl = 'https:' + streamUrl;

    res.json({
      streams: [{ name: 'Sưu Tầm Phim', title: 'Vietsub Full HD', url: streamUrl }]
    });
  } catch (err) {
    res.json({ streams: [] });
  }
});

app.get('/', (req, res) => res.send('SieuTamPhim Addon Online!'));

const PORT = process.env.PORT || 7000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
      
