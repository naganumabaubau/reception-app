const express = require('express');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Teams Webhook URL =====
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || 'https://default1eb266c90d084b36af053d1d9a4f68.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8fdbb30e0416443b9e341b9df8df59e9/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=RL858b5WAEgabi0UQeKd9IZCZaFz1bbiCNv-P43gj50';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Teams通知エンドポイント
app.post('/api/notify', async (req, res) => {
  const { name, company, target, purpose, count, checkinTime } = req.body;

  const time = new Date(checkinTime).toLocaleTimeString('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo'
  });

  // Adaptive Card for Teams
  const card = {
    type: "message",
    attachments: [
      {
        contentType: "application/vnd.microsoft.card.adaptive",
        contentUrl: null,
        content: {
          "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
          type: "AdaptiveCard",
          version: "1.4",
          body: [
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
            },
            {
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
            }
          ]
        }
      }
    ]
  };

  try {
    const response = await fetch(TEAMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(card)
    });

    if (response.ok) {
      console.log(`✅ Teams通知送信完了: ${name} 様の来客通知`);
      res.json({ success: true });
    } else {
      const text = await response.text();
      console.error('❌ Teams通知エラー:', response.status, text);
      res.status(500).json({ success: false, error: text });
    }
  } catch (err) {
    console.error('❌ Teams通知エラー:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 設定API（管理画面とアプリ間で設定を共有）
let receptionSettings = {};

app.get('/api/settings', (req, res) => {
  res.json(receptionSettings);
});

app.post('/api/settings', (req, res) => {
  receptionSettings = req.body;
  console.log('⚙️ 設定を更新しました');
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
