const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// ... (Các phần cấu hình app, manifest, loadAllData giữ nguyên như bản trước)

// CHỈ CẦN THAY THẾ ĐOẠN app.get('/meta/:type/:id.json' ...) BẰNG ĐOẠN DƯỚI ĐÂY:

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
        let episodeNum = idx + 1;
        const lowerName = (ep.name || '').toLowerCase();
        
        // 1. Logic bắt chữ: Phần 1, Season 2, Mùa 3, Phần I, Phần II...
        const textMatch = lowerName.match(/(?:phần|season|mùa)\s*([ivx0-9]+)/);
        if (textMatch) {
            const roman = { 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6, 'vii': 7, 'viii': 8 };
            seasonNum = roman[textMatch[1]] || parseInt(textMatch[1]) || 1;
            // Nếu có chữ "Tập" đi kèm, lấy số tập
            const epMatch = lowerName.match(/tập\s*(\d+)/);
            if (epMatch) episodeNum = parseInt(epMatch[1]);
        } else {
            // 2. Logic dự phòng: Nếu phim dài quá 24 tập mà không ghi "Phần", tự chia mùa
            if (epData.length > 24) {
                seasonNum = Math.floor(idx / 24) + 1;
                episodeNum = (idx % 24) + 1;
            }
        }

        return {
          id: `phimapi:${slug}:${ep.slug}`,
          title: ep.name || `Tập ${idx + 1}`,
          thumbnail: thumbImg,
          season: seasonNum,
          episode: episodeNum
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
          videos: videos
        }
      });
    } catch (e) {
      return res.json({ meta: null });
    }
  }
  res.json({ meta: null });
});

// ... (phần server.listen giữ nguyên)
