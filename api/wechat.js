const crypto = require('crypto');

const JOURNALS = [
  {
    name: "Journal of Biomolecular Structure and Dynamics",
    aliases: ["JBSD", "生物分子结构", "biomolecular"],
    jif_2024: "2.4",
    impact_factor: "2.7",
    change_2yr: "-0.3",
    jcr: "Q2",
    cas_category: "生物学",
    cas_zone: "1区",
    notes: ""
  }
];

function verifySignature(token, timestamp, nonce, signature) {
  const str = [token, timestamp, nonce].sort().join('');
  return crypto.createHash('sha1').update(str).digest('hex') === signature;
}

function parseXML(xml) {
  const get = (tag) => {
    const m = xml.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\/${tag}>`));
    return m ? m[1] : '';
  };
  return { to: get('ToUserName'), from: get('FromUserName'), content: get('Content'), type: get('MsgType') };
}

function buildReply(to, from, content) {
  return `<xml><ToUserName><![CDATA[${to}]]></ToUserName><FromUserName><![CDATA[${from}]]></FromUserName><CreateTime>${Math.floor(Date.now()/1000)}</CreateTime><MsgType><![CDATA[text]]></MsgType><Content><![CDATA[${content}]]></Content></xml>`;
}

async function findJournal(input) {
  const list = JOURNALS.map(j =>
    `${j.name}${j.aliases ? ' | ' + j.aliases.join(' | ') : ''}`
  ).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.CLAUDE_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `期刊列表：\n${list}\n\n用户输入："${input}"\n\n用户可能有错别字或不完整输入，判断最匹配哪个期刊，只返回该期刊的完整英文名，完全无关则返回NOT_FOUND，不要返回其他任何内容。`
      }]
    })
  });

  const data = await res.json();
  return data.content[0].text.trim();
}

module.exports = async (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  const token = process.env.WECHAT_TOKEN;

  if (req.method === 'GET') {
    if (verifySignature(token, timestamp, nonce, signature)) {
      return res.send(echostr);
    }
    return res.status(403).send('验证失败');
  }

  if (req.method === 'POST') {
    // 读取原始body
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');

    console.log('收到微信消息:', body);

    const msg = parseXML(body);
    console.log('解析结果:', JSON.stringify(msg));

    if (msg.type !== 'text') {
      res.setHeader('Content-Type', 'application/xml');
      return res.send(buildReply(msg.from, msg.to, '请发送期刊名称进行查询～'));
    }

    try {
      const matched = await findJournal(msg.content);
      console.log('匹配结果:', matched);

      if (matched === 'NOT_FOUND') {
        res.setHeader('Content-Type', 'application/xml');
        return res.send(buildReply(msg.from, msg.to, `没有找到"${msg.content}"相关期刊，请换个关键词试试～`));
      }

      const journal = JOURNALS.find(j =>
        j.name.toLowerCase() === matched.toLowerCase()
      );

      if (!journal) {
        res.setHeader('Content-Type', 'application/xml');
        return res.send(buildReply(msg.from, msg.to, `没有找到"${msg.content}"相关期刊，请换个关键词试试～`));
      }

      const change = parseFloat(journal.change_2yr);
      const changeStr = change > 0 ? `↑ +${journal.change_2yr}` : `↓ ${journal.change_2yr}`;
      const notesStr = journal.notes ? `\n💬 备注：${journal.notes}` : '';

      const reply = `📚 期刊查询结果

📖 ${journal.name}

📊 影响因子数据
- JIF 2024（2025更新）：${journal.jif_2024}
- 影响因子：${journal.impact_factor}
- 2年变化：${changeStr}

🏆 分区信息
- JCR分区：${journal.jcr}
- 中科院大类：${journal.cas_category}
- 中科院分区：${journal.cas_zone}${notesStr}`;

      res.setHeader('Content-Type', 'application/xml');
      return res.send(buildReply(msg.from, msg.to, reply));

    } catch (e) {
      console.error('出错了:', e);
      res.setHeader('Content-Type', 'application/xml');
      return res.send(buildReply(msg.from, msg.to, '查询出错，请稍后再试～'));
    }
  }

  return res.status(200).send('ok');
};
