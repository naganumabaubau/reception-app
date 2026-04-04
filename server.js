const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Teams Webhook URL =====
const TEAMS_WEBHOOK_URL = 'https://default1eb266c90d084b36af053d1d9a4f68.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9cb3e48558b740dd8e869e7a53aaedcb/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=EmsfZkcfGIF7xcI3XkdSWqE7H1THfr99ibMTuvdL1Y8';

// 設定データ（ファイルに永続化）
const SETTINGS_FILE = path.join(__dirname, 'data_settings.json');
const VISITORS_FILE = path.join(__dirname, 'data_visitors.json');
const FACES_FILE = path.join(__dirname, 'data_faces.json');

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function saveJSON(file, data) {
  try { fs.writeFileSync(file, JSON.stringify(data)); } catch (e) { console.error('ファイル保存エラー:', e.message); }
}

let receptionSettings = loadJSON(SETTINGS_FILE, {});

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Teams通知エンドポイント（画像添付対応）
app.post('/api/notify', async (req, res) => {
  const { name, company, target, purpose, count, checkinTime, photo } = req.body;

  const time = new Date(checkinTime).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo'
  });

  // Adaptive Card body
  const cardBody = [
    {
      type: "TextBlock",
      text: "来客のお知らせ",
      weight: "Bolder",
      size: "Large",
      color: "Accent"
    },
    {
      type: "TextBlock",
      text: `${name} 様がお見えです`,
      weight: "Bolder",
      size: "Medium",
      spacing: "Small"
    }
  ];

  // 写真があればカードに追加（50KB以下のみ。大きすぎるとPower Automateが拒否する）
  if (photo && photo.length < 70000) {
    cardBody.push({
      type: "Image",
      url: photo,
      size: "Medium",
      horizontalAlignment: "Center",
      spacing: "Medium"
    });
  }

  cardBody.push({
    type: "FactSet",
    facts: [
      { title: "お名前", value: `${name} 様` },
      { title: "会社名", value: company },
      { title: "訪問先", value: target },
      { title: "ご用件", value: purpose },
      { title: "人数", value: `${count}名` },
      { title: "受付時刻", value: time }
    ],
    spacing: "Medium"
  });

  const card = {
    type: "message",
    attachments: [{
      contentType: "application/vnd.microsoft.card.adaptive",
      contentUrl: null,
      content: {
        "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
        type: "AdaptiveCard",
        version: "1.4",
        body: cardBody
      }
    }]
  };

  try {
    const response = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });

    if (response.ok) {
      console.log(`✅ Teams通知送信完了: ${name} 様の来客通知`);
    } else {
      const text = await response.text();
      console.error('❌ Teams通知エラー:', response.status, text);
    }
  } catch (err) {
    console.error('❌ Teams通知エラー:', err.message);
  }

  res.json({ success: true });
});

// 設定API（管理画面とアプリ間で設定を共有）
app.get('/api/settings', (req, res) => {
  res.json(receptionSettings);
});

app.post('/api/settings', (req, res) => {
  receptionSettings = req.body;
  saveJSON(SETTINGS_FILE, receptionSettings);
  console.log('⚙️ 設定を更新しました（ファイル保存済み）');
  res.json({ success: true });
});

// 来客データAPI（アプリ・管理画面間でデータを共有）
let visitors = loadJSON(VISITORS_FILE, []);

app.get('/api/visitors', (req, res) => {
  // 一覧では写真データを省略（サイズ削減）
  const list = visitors.map(({ photo, ...rest }) => ({ ...rest, hasPhoto: !!photo }));
  res.json(list);
});

app.get('/api/visitors/:id/photo', (req, res) => {
  const v = visitors.find(v => v.id === parseInt(req.params.id));
  if (v && v.photo) {
    res.json({ photo: v.photo });
  } else {
    res.status(404).json({ photo: null });
  }
});

app.post('/api/visitors', (req, res) => {
  visitors.unshift(req.body);
  saveJSON(VISITORS_FILE, visitors);
  console.log(`📋 来客データ追加: ${req.body.name}${req.body.photo ? ' (写真あり)' : ''}`);
  res.json({ success: true });
});

app.post('/api/visitors/checkout', (req, res) => {
  const { id } = req.body;
  const v = visitors.find(v => v.id === id);
  if (v) {
    v.status = 'done';
    v.checkoutTime = new Date().toISOString();
    saveJSON(VISITORS_FILE, visitors);
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false });
  }
});

// 顔データAPI
let faceDB = loadJSON(FACES_FILE, []);

app.get('/api/faces', (req, res) => {
  res.json(faceDB);
});

app.post('/api/faces', (req, res) => {
  const { name } = req.body;
  const existing = faceDB.findIndex(e => e.name === name);
  if (existing >= 0) {
    faceDB[existing] = req.body;
  } else {
    faceDB.push(req.body);
  }
  saveJSON(FACES_FILE, faceDB);
  console.log(`👤 顔データ登録: ${name}`);
  res.json({ success: true });
});

app.delete('/api/faces/:name', (req, res) => {
  faceDB = faceDB.filter(e => e.name !== req.params.name);
  saveJSON(FACES_FILE, faceDB);
  res.json({ success: true });
});

// ローカルIPを取得
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

app.listen(PORT, '0.0.0.0', () => {
  const ip = getLocalIP();
  console.log('');
  console.log('========================================');
  console.log('  受付システム 起動しました');
  console.log('========================================');
  console.log(`  PC:     http://localhost:${PORT}`);
  console.log(`  スマホ: http://${ip}:${PORT}`);
  console.log('  (同じWi-Fiに接続してください)');
  console.log('========================================');
  console.log('');
});
