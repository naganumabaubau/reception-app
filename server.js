const express = require('express');
const nodemailer = require('nodemailer');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Teams Webhook URL =====
const TEAMS_WEBHOOK_URL = process.env.TEAMS_WEBHOOK_URL || 'https://default1eb266c90d084b36af053d1d9a4f68.57.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/8fdbb30e0416443b9e341b9df8df59e9/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=RL858b5WAEgabi0UQeKd9IZCZaFz1bbiCNv-P43gj50';

// 設定データ（先に定義。通知APIから参照される）
let receptionSettings = {};

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

  // 写真があればカードに追加
  if (photo) {
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
    // 管理画面の設定を優先、なければデフォルト
    const webhookUrl = receptionSettings.webhook || TEAMS_WEBHOOK_URL;
    const response = await fetch(webhookUrl, {
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

  // メール通知（画像添付対応）
  const emailTo = receptionSettings.notifyEmail;
  const emailFrom = receptionSettings.smtpUser;
  const emailPass = receptionSettings.smtpPassword;

  if (emailTo && emailFrom && emailPass) {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: { user: emailFrom, pass: emailPass }
      });

      const mailOptions = {
        from: `受付システム <${emailFrom}>`,
        to: emailTo,
        subject: `【来客通知】${name} 様がお見えです`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;">
            <div style="background:#009bdb;color:#fff;padding:14px 20px;border-radius:8px 8px 0 0;">
              <h2 style="margin:0;font-size:16px;">来客のお知らせ</h2>
            </div>
            <div style="background:#fff;padding:16px;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">
              ${photo ? '<img src="cid:visitor-photo" style="width:100%;max-width:300px;border-radius:8px;margin-bottom:12px;" />' : ''}
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:6px 0;color:#888;width:80px;">お名前</td><td style="padding:6px 0;font-weight:bold;">${name} 様</td></tr>
                <tr><td style="padding:6px 0;color:#888;">会社名</td><td style="padding:6px 0;">${company}</td></tr>
                <tr><td style="padding:6px 0;color:#888;">訪問先</td><td style="padding:6px 0;">${target}</td></tr>
                <tr><td style="padding:6px 0;color:#888;">ご用件</td><td style="padding:6px 0;">${purpose}</td></tr>
                <tr><td style="padding:6px 0;color:#888;">人数</td><td style="padding:6px 0;">${count}名</td></tr>
                <tr><td style="padding:6px 0;color:#888;">受付時刻</td><td style="padding:6px 0;">${time}</td></tr>
              </table>
            </div>
          </div>`,
        attachments: []
      };

      // 写真をBase64からバッファに変換して添付
      if (photo) {
        const base64Data = photo.replace(/^data:image\/\w+;base64,/, '');
        mailOptions.attachments.push({
          filename: `visitor_${Date.now()}.jpg`,
          content: Buffer.from(base64Data, 'base64'),
          cid: 'visitor-photo'
        });
      }

      await transporter.sendMail(mailOptions);
      console.log(`✉ メール送信完了: ${emailTo}${photo ? ' (写真付き)' : ''}`);
    } catch (err) {
      console.error('✉ メール送信エラー:', err.message);
    }
  }

  res.json({ success: true });
});

// 設定API（管理画面とアプリ間で設定を共有）
app.get('/api/settings', (req, res) => {
  res.json(receptionSettings);
});

app.post('/api/settings', (req, res) => {
  receptionSettings = req.body;
  console.log('⚙️ 設定を更新しました');
  res.json({ success: true });
});

// 来客データAPI（アプリ・管理画面間でデータを共有）
let visitors = [];

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
  console.log(`📋 来客データ追加: ${req.body.name}${req.body.photo ? ' (写真あり)' : ''}`);
  res.json({ success: true });
});

app.post('/api/visitors/checkout', (req, res) => {
  const { id } = req.body;
  const v = visitors.find(v => v.id === id);
  if (v) {
    v.status = 'done';
    v.checkoutTime = new Date().toISOString();
    res.json({ success: true });
  } else {
    res.status(404).json({ success: false });
  }
});

// 顔データAPI
let faceDB = [];

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
  console.log(`👤 顔データ登録: ${name}`);
  res.json({ success: true });
});

app.delete('/api/faces/:name', (req, res) => {
  faceDB = faceDB.filter(e => e.name !== req.params.name);
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
