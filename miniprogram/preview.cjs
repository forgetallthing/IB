// 用 miniprogram-ci 生成真机预览二维码（无需微信开发者工具）
const path = require('path');
const ci = require('miniprogram-ci');

(async () => {
  try {
    const project = new ci.Project({
      appid: 'wxa41d811ffbd955b1',
      type: 'miniProgram',
      projectPath: path.resolve(__dirname, 'dist'),
      privateKeyPath: path.resolve(__dirname, '.auth', 'private.wxa41d811ffbd955b1.key'),
      ignores: ['node_modules/**/*'],
    });
    const result = await ci.preview({
      project,
      desc: '录音转文字 tab 预览',
      setting: { es6: true, es7: true, minify: true, autoPrefixWXSS: true },
      qrcodeFormat: 'image',
      qrcodeOutputDest: path.resolve(__dirname, 'preview-qr.jpg'),
      robot: 1,
      onProgressUpdate: () => {},
    });
    console.log('PREVIEW_OK');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error('PREVIEW_FAILED:', error && error.message ? error.message : error);
    process.exit(1);
  }
})();
