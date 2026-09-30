// 仅上传已有的 Tauri NSIS 安装包到 GitHub Releases（不重新打包）
// 用法: npm run upload
// 打包+上传的完整流程见 scripts/release.cjs（npm run release）
const {
  buildDate, productName, tauriNsisDirectory, ask, ensureToken, parseRemote,
  listExes, findOrCreateRelease, uploadFiles,
} = require('./_shared.cjs');

(async () => {
  const distDir = tauriNsisDirectory();
  const exes = listExes(distDir);
  if (exes.length === 0) {
    throw new Error('Tauri NSIS 产物目录中没有 .exe 安装包。请先运行 npm run build。');
  }

  console.log('以下安装包将上传：');
  exes.forEach((f) => console.log('  - ' + f));
  console.log('');

  // 用当天日期作为默认 tag；若当天已经传过想重传，会自动复用/覆盖同名 asset
  const date = buildDate();
  const tag = await ask('Release 版本号 (tag，默认当天日期)', date);
  const notes = await ask('发布说明', `${productName()} ${date}`);

  const token = await ensureToken();
  if (!token) {
    throw new Error('未提供 Token。');
  }

  const remote = parseRemote() || { owner: 'rewhtie', repo: 'folderPhoto' };

  console.log(`\n==> 创建/查找 Release（tag = ${tag}）\n`);
  const release = await findOrCreateRelease(token, remote.owner, remote.repo, tag, notes);

  console.log('\n==> 上传安装包\n');
  await uploadFiles(token, release, exes);

  console.log(`\n完成！https://github.com/${remote.owner}/${remote.repo}/releases/tag/${tag}`);
})().catch((e) => {
  console.error('\n出错：', e.message);
  process.exitCode = 1;
});