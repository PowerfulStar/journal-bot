const crypto = require('crypto');

module.exports = async (req, res) => {
  const { signature, timestamp, nonce, echostr } = req.query;
  const token = process.env.WECHAT_TOKEN;

  console.log('收到请求:', req.method, JSON.stringify(req.query));

  // GET：微信验证
  if (req.method === 'GET') {
    const str = [token, timestamp, nonce].sort().join('');
    const sha1 = crypto.createHash('sha1').update(str).digest('hex');
    if (sha1 === signature) {
      return res.send(echostr);
    }
    return res.status(403).send('验证失败');
  }

  // POST：收到消息
  if (req.method === 'POST') {
    console.log('收到POST消息!');
    
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    console.log('消息内容:', body);

    // 先直接回复一个固定消息测试
    const from = body.match(/<FromUserName><!\[CDATA\[(.+?)\]\]>/)?.[1] || '';
    const to = body.match(/<ToUserName><!\[CDATA\[(.+?)\]\]>/)?.[1] || '';
    
    const reply = `<xml>
<ToUserName><![CDATA[${from}]]></ToUserName>
<FromUserName><![CDATA[${to}]]></FromUserName>
<CreateTime>${Math.floor(Date.now()/1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[收到你的消息了！测试成功🎉]]></Content>
</xml>`;

    res.setHeader('Content-Type', 'application/xml');
    return res.send(reply);
  }

  return res.send('ok');
};
